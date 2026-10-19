import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

import { trpc } from '@/client/api';
import { identifyRevenueCat } from '@/client/revenuecat';

/**
 * The signed-in user's free-tier capacity state, shared across the app.
 *
 * One `entitlements.status` query backs three things that must never disagree: the root
 * layout's downgrade gate, the paywall's "you have N of M" copy, and anything that wants to
 * know whether this account is pro. The shape is web's `SelectionStatus`
 * (`web/src/lib/core/active-selection.ts`), inferred straight off the tRPC router rather than
 * re-declared here, so a server-side change to it breaks this file's type check instead of
 * silently drifting.
 *
 * It is also the single place {@link identifyRevenueCat} is called, because this provider is
 * the one component that mounts exactly once per signed-in user and mounts *before* any
 * paywall can open. See `client/revenuecat.ts` for why that id has to be Klect's own `User.id`.
 */

/** The `entitlements.status` payload as mobile receives it. Derived, never hand-written. */
export type EntitlementStatus = Awaited<ReturnType<typeof trpc.entitlements.status.query>>;

type EntitlementsValue = {
  /** Null until the first fetch lands, or if every fetch has failed. */
  status: EntitlementStatus | null;
  /** True only while the *first* fetch is in flight — background refreshes don't set it. */
  loading: boolean;
  /** Last fetch failure, or null. A failure is non-fatal: the server still enforces the caps. */
  error: string | null;
  /** Convenience read; false while status is unknown, which fails safe toward "show the paywall". */
  isPro: boolean;
  /** Refetch now. Returns the fresh status, or null if the fetch failed. */
  refresh: () => Promise<EntitlementStatus | null>;
  /**
   * Refetch after a successful purchase, retrying until the server agrees the user is pro.
   * Klect's own `Entitlement` row is written by the RevenueCat webhook (Stage 5), so there is
   * a short window where StoreKit says "paid" and our database hasn't heard yet.
   */
  refreshAfterPurchase: () => Promise<void>;
};

const FALLBACK: EntitlementsValue = {
  status: null,
  loading: false,
  error: null,
  isPro: false,
  refresh: async () => null,
  refreshAfterPurchase: async () => {},
};

const EntitlementsContext = createContext<EntitlementsValue>(FALLBACK);

/**
 * The current entitlement status. Safe to call outside the provider (returns the inert
 * fallback above) so a screen reachable from the Share Extension or a test harness doesn't
 * have to special-case it.
 */
export function useEntitlements(): EntitlementsValue {
  return useContext(EntitlementsContext);
}

/** How many times, and how far apart, to re-ask the server after a purchase. */
const POST_PURCHASE_ATTEMPTS = 6;
const POST_PURCHASE_DELAY_MS = 1500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetches and caches `entitlements.status` for the signed-in user.
 *
 * Mounted by the root layout around the authenticated subtree, so `userId` is always a real,
 * onboarded user. Refetches when the app returns to the foreground (a subscription can lapse
 * or be bought while the app is backgrounded) and on demand via `refresh` — which is what the
 * downgrade screen calls after committing a selection and what the paywall calls after a
 * purchase or a restore.
 */
export function EntitlementsProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const [status, setStatus] = useState<EntitlementStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Guards setState after unmount (sign-out races the in-flight query).
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async (): Promise<EntitlementStatus | null> => {
    try {
      const next = await trpc.entitlements.status.query();
      if (!mounted.current) return next;
      setStatus(next);
      setError(null);
      return next;
    } catch (e) {
      if (mounted.current) {
        setError(e instanceof Error ? e.message : 'Could not check your plan.');
      }
      return null;
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  const refreshAfterPurchase = useCallback(async () => {
    for (let attempt = 0; attempt < POST_PURCHASE_ATTEMPTS; attempt++) {
      const next = await refresh();
      if (next?.isPro) return;
      if (!mounted.current) return;
      await sleep(POST_PURCHASE_DELAY_MS);
    }
    // Still not pro after the retries: the webhook is slow or misconfigured. The purchase is
    // not lost (RevenueCat holds it, and restore recovers it), so there is nothing to undo —
    // the next foreground refresh will pick it up.
  }, [refresh]);

  // Tell RevenueCat who this is, as early as a signed-in id exists. Idempotent, and a no-op
  // in a build with a blank API key.
  useEffect(() => {
    identifyRevenueCat(userId);
  }, [userId]);

  // Initial fetch, plus a re-fetch if the signed-in user ever changes under us.
  useEffect(() => {
    setLoading(true);
    refresh();
  }, [userId, refresh]);

  // A lapse, a renewal, or a purchase made elsewhere all land while we're backgrounded.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const value = useMemo<EntitlementsValue>(
    () => ({
      status,
      loading,
      error,
      isPro: status?.isPro ?? false,
      refresh,
      refreshAfterPurchase,
    }),
    [status, loading, error, refresh, refreshAfterPurchase],
  );

  return (
    <EntitlementsContext.Provider value={value}>{children}</EntitlementsContext.Provider>
  );
}
