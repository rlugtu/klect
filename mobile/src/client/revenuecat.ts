import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from 'react-native-purchases';

/**
 * RevenueCat (in-app purchase) plumbing for the iOS app.
 *
 * Everything here is a thin, failure-tolerant wrapper around `react-native-purchases`.
 * Two hard rules shape it:
 *
 * 1. **It must no-op cleanly when the API key is blank.** The key is produced by Stage 2
 *    of the monetization build (Ryan's RevenueCat account work) and is not in the repo, so
 *    every build before that lands runs with `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` unset.
 *    An unconfigured SDK must leave the app fully usable and show a visibly stubbed paywall,
 *    never a crash. Same pattern Mapbox (`EXPO_PUBLIC_MAPBOX_TOKEN`) and Supabase Realtime
 *    already use: read the env var, degrade to a disabled mode when it's empty.
 *
 * 2. **RevenueCat's `app_user_id` must be Klect's own `User.id`.** The Stage 5 webhook
 *    (`web/src/app/api/webhooks/revenuecat/route.ts`) resolves `app_user_id` directly as a
 *    Klect user id; if the SDK mints an anonymous id instead, every subscription event lands
 *    on an unknown user and no `Entitlement` row is ever written. {@link identifyRevenueCat}
 *    is the only place that id is set, and it is called the moment a signed-in user exists
 *    (see `client/entitlements.tsx`), before any paywall can open.
 *
 * iOS only, deliberately. Android is out of scope for this stage (no Play service account,
 * no Android app in RevenueCat), so there is no Android key and no Android branch.
 *
 * This module is **never** imported by the Share Extension. That separate process has no
 * StoreKit access and no navigator, so it can't host a purchase flow at all — it nudges the
 * user into the host app instead (see `share-extension.tsx`).
 */

/**
 * The entitlement identifier configured in the RevenueCat dashboard. Literally `klect_pro`,
 * not `pro` — it's the exact string Stage 2 created and the webhook maps against.
 */
export const KLECT_PRO_ENTITLEMENT = 'klect_pro';

/**
 * Public iOS SDK key, inlined at bundle time by Expo. Blank until Stage 2 supplies it, which
 * is the disabled state the whole module is built around.
 */
const API_KEY = (process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? '').trim();

/** Whether a real purchase flow is even possible in this build. */
export function revenueCatAvailable(): boolean {
  return Platform.OS === 'ios' && API_KEY.length > 0;
}

/** `configure()` is a one-shot; these track whether it has run and whether it blew up. */
let configured = false;
let configureFailed = false;
/** Last app user id handed to RevenueCat, so a re-render doesn't re-issue the same logIn. */
let identifiedUserId: string | null = null;

/**
 * Configure the SDK once, lazily. Returns whether purchases are usable afterwards.
 *
 * `appUserID` is passed straight into `configure` when we already know it so the SDK never
 * mints an anonymous id in the first place; {@link identifyRevenueCat} still calls `logIn`
 * explicitly afterwards, which is a no-op when the ids match and the real switch when they
 * don't (a second account signing in on the same device).
 *
 * A native-side failure is swallowed into `configureFailed` rather than thrown: an app that
 * can't reach StoreKit should still open, and the paywall should show its stub state.
 */
function ensureConfigured(appUserID?: string): boolean {
  if (!revenueCatAvailable() || configureFailed) return false;
  if (configured) return true;
  try {
    Purchases.configure({ apiKey: API_KEY, appUserID: appUserID ?? null });
    configured = true;
  } catch (e) {
    // The native module is missing (a dev client built before these packages were added) or
    // the key is malformed. Either way, degrade to the stub rather than taking the app down.
    configureFailed = true;
    console.warn('[revenuecat] configure failed — purchases disabled for this session', e);
    return false;
  }
  if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG).catch(() => {});
  return true;
}

/**
 * Whether the purchase flow is live right now: key present, platform iOS, `configure`
 * succeeded. The paywall renders its stubbed state when this is false.
 *
 * Call from an effect, not from render: it lazily runs `configure` on first use.
 */
export function revenueCatReady(): boolean {
  return ensureConfigured();
}

/**
 * Point RevenueCat at Klect's own user id. **This is the hard requirement Stage 5 depends on**
 * (see the file header). Idempotent and safe to call on every render pass of the provider that
 * owns it; the `identifiedUserId` guard keeps it to one network call per signed-in user.
 *
 * Belt and braces on the id: it goes into `configure` when this is the first call (so no
 * anonymous id is ever minted), and `logIn` runs regardless. That second call is what makes
 * the ordering irrelevant — if some other caller reached {@link revenueCatReady} first and
 * configured anonymously, `logIn` switches the SDK onto the real id and RevenueCat carries
 * the anonymous customer's purchases across.
 *
 * Resolves (rather than rejecting) when purchases are unavailable, so callers never need a
 * try/catch just to handle the blank-key build.
 */
export async function identifyRevenueCat(userId: string): Promise<void> {
  if (!userId) return;
  if (!ensureConfigured(userId)) return;
  if (identifiedUserId === userId) return;
  try {
    await Purchases.logIn(userId);
    identifiedUserId = userId;
  } catch (e) {
    console.warn('[revenuecat] logIn failed — purchases will not be attributed', e);
  }
}

/**
 * Drop the RevenueCat identity on sign-out, so the next account on this device doesn't
 * inherit the previous one's purchases view. Best effort; never throws.
 */
export async function signOutRevenueCat(): Promise<void> {
  identifiedUserId = null;
  if (!configured) return;
  try {
    await Purchases.logOut();
  } catch {
    // Already anonymous, or offline. Nothing the user can act on.
  }
}

/**
 * The offering the paywall renders — RevenueCat's "current" offering, which Stage 2 points at
 * the monthly ($1.99) and annual ($19.99) products. `null` when purchases are unavailable or
 * no offering is configured yet; the paywall treats those as two distinct empty states.
 */
export async function getProOffering(): Promise<PurchasesOffering | null> {
  if (!ensureConfigured()) return null;
  const offerings = await Purchases.getOfferings();
  return offerings.current;
}

/** Whether a CustomerInfo payload grants `klect_pro` right now. */
export function hasProEntitlement(info: CustomerInfo): boolean {
  return info.entitlements.active[KLECT_PRO_ENTITLEMENT] !== undefined;
}

/**
 * Whether *this device's* StoreKit records say `klect_pro` is active right now.
 *
 * The read-only half of the entitlement story, and the fallback for the one failure mode the
 * server-side `Entitlement` row cannot cover on its own: that row is written only by the
 * RevenueCat webhook (`web/src/app/api/webhooks/revenuecat/route.ts`), so between a successful
 * purchase and the webhook landing, Apple considers the user a subscriber and Klect does not.
 * `client/entitlements.tsx` ORs this on top of the server's answer so that window stops reading
 * as "free account" (see the "server first" note there: the server stays primary, this can only
 * ever *add* pro, never take it away).
 *
 * Three properties it is built around, all of them load-bearing:
 *
 * 1. **It never throws.** Every failure (offline, native module missing, StoreKit unavailable)
 *    resolves to `false`, i.e. fails safe toward "show the paywall". A fallback that can throw
 *    would turn a slow webhook into a crash, which is strictly worse than the bug it fixes.
 * 2. **No network call off the happy path.** `ensureConfigured()` is false on Android, in any
 *    build with a blank `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`, and after a failed `configure`,
 *    so this returns immediately without touching the SDK in all three cases.
 * 3. **Read-only.** No purchase, no restore, no identity change. `getCustomerInfo` answers from
 *    the SDK's own cache when it can, which is also why it stays usable offline right after a
 *    purchase the server has not seen yet.
 *
 * Deliberately *not* used for caps, lock state, or plan/expiry display: those stay entirely
 * server-derived, because this device can only answer "is `klect_pro` active for the Apple
 * account on this phone", not "what does Klect owe this user".
 */
export async function deviceHasProEntitlement(): Promise<boolean> {
  if (!ensureConfigured()) return false;
  try {
    return hasProEntitlement(await Purchases.getCustomerInfo());
  } catch (e) {
    // Offline with an empty cache, or a native-side failure. Neither is actionable, and
    // neither may be allowed to look like a downgrade, so: no entitlement, no throw, no toast.
    if (__DEV__) console.warn('[revenuecat] getCustomerInfo failed, treating as not pro', e);
    return false;
  }
}

/** Outcome of a purchase attempt, with cancellation separated from failure. */
export type PurchaseOutcome =
  | { status: 'entitled' }
  /** Bought, but `klect_pro` isn't active — a mis-mapped product in the dashboard. */
  | { status: 'purchased-without-entitlement' }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

/** Whether a thrown RevenueCat error is the user backing out of the StoreKit sheet. */
function isUserCancellation(e: unknown): boolean {
  const code = (e as { code?: unknown } | null)?.code;
  return code === Purchases.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR;
}

/** Message worth showing for a failed purchase or restore. */
function purchaseErrorMessage(e: unknown, fallback: string): string {
  const message = (e as { message?: unknown } | null)?.message;
  return typeof message === 'string' && message ? message : fallback;
}

/**
 * Buy a package. Never throws: a cancellation and a failure are both ordinary outcomes the
 * paywall renders differently, and neither should bubble into an error boundary.
 *
 * Note that a successful purchase makes the user pro *on the device* immediately, but Klect's
 * own `Entitlement` row is written by the Stage 5 webhook, so the server can lag by a moment.
 * Callers show success from this result and refresh the server status separately.
 */
export async function purchasePro(pkg: PurchasesPackage): Promise<PurchaseOutcome> {
  if (!ensureConfigured()) {
    return { status: 'error', message: 'Purchases are not available in this build.' };
  }
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return hasProEntitlement(customerInfo)
      ? { status: 'entitled' }
      : { status: 'purchased-without-entitlement' };
  } catch (e) {
    if (isUserCancellation(e)) return { status: 'cancelled' };
    return { status: 'error', message: purchaseErrorMessage(e, 'Could not complete the purchase.') };
  }
}

/** Outcome of a restore attempt. */
export type RestoreOutcome =
  | { status: 'entitled' }
  /** Restore succeeded but this Apple ID has nothing to restore. */
  | { status: 'nothing-to-restore' }
  | { status: 'error'; message: string };

/**
 * Re-attach purchases already made with this Apple ID (a reinstall, a new device, a second
 * Klect account). Apple requires a reachable restore path on any screen that sells a
 * subscription, which is why the paywall always shows it — even in the stub state, where it
 * reports that purchases aren't configured rather than silently doing nothing.
 */
export async function restorePro(): Promise<RestoreOutcome> {
  if (!ensureConfigured()) {
    return { status: 'error', message: 'Purchases are not available in this build.' };
  }
  try {
    const info = await Purchases.restorePurchases();
    return hasProEntitlement(info) ? { status: 'entitled' } : { status: 'nothing-to-restore' };
  } catch (e) {
    return { status: 'error', message: purchaseErrorMessage(e, 'Could not restore purchases.') };
  }
}
