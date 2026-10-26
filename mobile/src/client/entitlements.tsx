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
import { deviceHasProEntitlement, identifyRevenueCat } from '@/client/revenuecat';

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
 *
 * ## Two sources, one answer: the server first, the device as a floor
 *
 * `status` is always and only the server's answer. {@link EntitlementsValue.isPro} is the
 * server's answer OR'd with this device's StoreKit records
 * ({@link deviceHasProEntitlement}), and that asymmetry is the whole design:
 *
 *  - The server is asked first and stays primary. It is the only thing that knows the caps,
 *    the lock state, and the plan, so every count, limit, `needsSelection` and billing label
 *    on screen comes from `status` and nothing else.
 *  - The device is consulted *only* when the server failed or said "not pro", and can only
 *    ever add pro on top of that. A device "no" never overrides a server "yes", so a comped
 *    or Stripe-billed account (which this phone's App Store knows nothing about) can never be
 *    downgraded by this check.
 *
 * The window it closes is real and was shipping a dead end: Klect's own `Entitlement` row is
 * written by the RevenueCat webhook, so a user who has just paid is a paying customer on
 * Apple's side and a free one on ours until that webhook lands. Before this, that window read
 * as "not pro" everywhere, including at the blocking downgrade gate.
 */

/** The `entitlements.status` payload as mobile receives it. Derived, never hand-written. */
export type EntitlementStatus = Awaited<ReturnType<typeof trpc.entitlements.status.query>>;

/**
 * How {@link EntitlementsValue.refreshAfterPurchase} ended. Three outcomes, because the
 * caller has to render something different for each:
 *
 *  - `confirmed`: the server agrees the user is pro. The purchase is fully landed; carry on.
 *  - `timed-out`: StoreKit says paid, our server still does not, and the retries ran out.
 *    Nothing is lost (RevenueCat holds the purchase and the next foreground refresh picks it
 *    up), but the user must be told that and given a way forward rather than left on a gate.
 *  - `abandoned`: the provider unmounted mid-poll (sign-out, or the screen was torn down).
 *    There is nobody left to show a result to, so callers should render nothing at all.
 */
export type PurchaseSyncOutcome = 'confirmed' | 'timed-out' | 'abandoned';

type EntitlementsValue = {
  /**
   * The server's view, or null until the first fetch lands / if every fetch has failed.
   * Server-only on purpose; see the "two sources" note above. Everything cap-shaped
   * (`needsSelection`, the limits, the counts, `plan`, `expiresAt`, `store`) must be read
   * from here, never inferred from {@link isPro}.
   */
  status: EntitlementStatus | null;
  /** True only while the *first* fetch is in flight — background refreshes don't set it. */
  loading: boolean;
  /** Last fetch failure, or null. A failure is non-fatal: the server still enforces the caps. */
  error: string | null;
  /**
   * Whether to treat this user as pro: `status.isPro` OR this device's StoreKit entitlement.
   * False while both are unknown, which fails safe toward "show the paywall".
   *
   * Use this for "should the user be let through / stop being sold to". Use `status.isPro`
   * when you specifically need the *server's* answer (the post-purchase poll does, and
   * Settings uses it to tell a landed subscription apart from one still syncing).
   */
  isPro: boolean;
  /** Refetch now. Returns the fresh *server* status, or null if the fetch failed. */
  refresh: () => Promise<EntitlementStatus | null>;
  /**
   * Refetch after a successful purchase, retrying until the server agrees the user is pro.
   * Klect's own `Entitlement` row is written by the RevenueCat webhook (Stage 5), so there is
   * a short window where StoreKit says "paid" and our database hasn't heard yet.
   *
   * Resolves to the {@link PurchaseSyncOutcome}, which the caller is expected to branch on:
   * silently giving up here is what used to strand a paying user on the paywall.
   */
  refreshAfterPurchase: () => Promise<PurchaseSyncOutcome>;
};

const FALLBACK: EntitlementsValue = {
  status: null,
  loading: false,
  error: null,
  isPro: false,
  refresh: async () => null,
  // Outside the provider there is no poll and nobody to report to, which is exactly what
  // `abandoned` means. Callers already have to handle it, so no new branch is needed.
  refreshAfterPurchase: async () => 'abandoned',
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

/**
 * How many times, and how far apart, to re-ask the server after a purchase. Six attempts
 * 1.5s apart is the ~9 seconds of waiting the "checking your purchase" state covers before
 * it gives up and says so.
 */
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
  /**
   * This device's StoreKit answer, refreshed alongside every server fetch that didn't already
   * come back pro. Never read on its own: it is OR'd into `isPro` below, so it can only add
   * pro to a server "no"/failure, never remove it from a server "yes".
   */
  const [deviceIsPro, setDeviceIsPro] = useState(false);
  // Guards setState after unmount (sign-out races the in-flight query).
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async (): Promise<EntitlementStatus | null> => {
    let next: EntitlementStatus | null = null;
    try {
      next = await trpc.entitlements.status.query();
      if (mounted.current) {
        setStatus(next);
        setError(null);
      }
    } catch (e) {
      if (mounted.current) {
        setError(e instanceof Error ? e.message : 'Could not check your plan.');
      }
    } finally {
      if (mounted.current) setLoading(false);
    }

    // Server first, device second: only ask StoreKit when the server failed or said "not
    // pro". A server "yes" needs no second opinion, and clearing the flag in that case keeps
    // a stale device "yes" from outliving a genuine lapse, since the next non-pro refresh re-asks.
    if (next?.isPro) {
      if (mounted.current) setDeviceIsPro(false);
    } else {
      // Never throws (see deviceHasProEntitlement) and makes no network call on Android or
      // in a build without a RevenueCat key, so this costs nothing where it can't help.
      const onDevice = await deviceHasProEntitlement();
      if (mounted.current) setDeviceIsPro(onDevice);
    }

    // The *server's* answer, deliberately. Callers that need "is the user pro" read `isPro`
    // off the context; `refreshAfterPurchase` needs to know whether the webhook has landed,
    // which only this can tell it.
    return next;
  }, []);

  const refreshAfterPurchase = useCallback(async (): Promise<PurchaseSyncOutcome> => {
    for (let attempt = 0; attempt < POST_PURCHASE_ATTEMPTS; attempt++) {
      // `refresh` returns the server status specifically, which is the point: the device
      // fallback must not short-circuit this loop. If it did, a never-arriving webhook would
      // look like success here and the "we haven't caught up yet" screen would never show,
      // and the user's `Entitlement` row (the thing every cap check reads) would stay wrong.
      const next = await refresh();
      if (next?.isPro) return 'confirmed';
      if (!mounted.current) return 'abandoned';
      await sleep(POST_PURCHASE_DELAY_MS);
      if (!mounted.current) return 'abandoned';
    }
    // Still not pro after the retries: the webhook is slow or misconfigured. The purchase is
    // not lost (RevenueCat holds it, and restore recovers it), so there is nothing to undo —
    // the next foreground refresh will pick it up. Reported rather than swallowed so the
    // caller can say so and offer a way out instead of leaving the user on a gate.
    return 'timed-out';
  }, [refresh]);

  // Tell RevenueCat who this is, as early as a signed-in id exists. Idempotent, and a no-op
  // in a build with a blank API key.
  useEffect(() => {
    identifyRevenueCat(userId);
  }, [userId]);

  // Initial fetch, plus a re-fetch if the signed-in user ever changes under us.
  useEffect(() => {
    setLoading(true);
    // A different account on this device must not inherit the previous one's device answer;
    // the refresh below re-derives it for whoever is signed in now.
    setDeviceIsPro(false);
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
      isPro: (status?.isPro ?? false) || deviceIsPro,
      refresh,
      refreshAfterPurchase,
    }),
    [status, loading, error, deviceIsPro, refresh, refreshAfterPurchase],
  );

  return (
    <EntitlementsContext.Provider value={value}>{children}</EntitlementsContext.Provider>
  );
}
