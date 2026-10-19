import "server-only";
import { PRO_ENTITLEMENT_ID } from "@/lib/revenuecat-web";

/**
 * A single read-only question put to RevenueCat with the server secret key:
 * "does RevenueCat think this user is pro right now?"
 *
 * ## Why this exists at all
 *
 * The local `Entitlement` row is the source of truth for every cap check, and it
 * is written by exactly one thing: the Stage 5 webhook. That stays true — nothing
 * here writes anything. The gap it fills is the few seconds after a user returns
 * from Stripe Checkout, when the webhook may not have landed yet. Without this the
 * success screen can only say "you're still on free", which reads as a failed
 * payment. With it, it can say "payment confirmed, unlocking now".
 *
 * ## Why it is not a fallback entitlement check
 *
 * Still never a cap check. A cap check that calls out to RevenueCat is a cap check
 * that fails open when RevenueCat is slow, which is the exact thing
 * `core/entitlements.ts` was written to avoid. Nothing here reads or writes the
 * local `Entitlement` row, and no access decision consults this module.
 *
 * ## One narrow exception to "never on a write path"
 *
 * This file used to say it was never consulted on a write path at all. That is no
 * longer strictly true, and the exception is worth stating rather than hiding:
 * {@link getRemoteEntitlement} is called by the TRANSFER branch of
 * `core/revenuecat.ts` to decide what to write for the user an entitlement was
 * transferred *to*.
 *
 * TRANSFER is the one event RevenueCat sends that does not describe a subscription:
 * it carries the ids involved and nothing about the plan, the store, or the expiry.
 * So there are exactly three options for the receiving user: guess (write a fake
 * expiry and have `isEntitlementActive` enforce fiction), do nothing (a user
 * RevenueCat considers entitled who is not pro in Klect), or ask RevenueCat what it
 * actually holds. Asking is the only one that produces a true row.
 *
 * The properties that made the original rule worth having all survive it:
 *
 *  - It is one event type, not a code path any user action reaches. No create, no
 *    cap check, and no page render depends on this call.
 *  - It fails closed, not open. A null return writes nothing at all, so a slow or
 *    broken RevenueCat cannot grant anybody access; it can only delay a transfer,
 *    which RevenueCat's own retry schedule then re-attempts.
 *  - The webhook is still the only writer of the `Entitlement` table. This supplies
 *    the data for that write; it does not perform it.
 *
 * Every failure mode (blank key, network error, unexpected shape) collapses to
 * `"unknown"` / `null`, so a caller always has a sane third branch, and a 404 for a
 * user RevenueCat has never seen is reported as a real "not entitled" answer rather
 * than an error.
 */

export type RemoteProStatus = "active" | "inactive" | "unknown";

/**
 * What RevenueCat currently holds for one app user id, as far as `klect_pro` goes.
 *
 * Deliberately shaped as the inputs an `Entitlement` row needs rather than as a
 * faithful mirror of RevenueCat's payload: this exists so the TRANSFER branch of
 * `core/revenuecat.ts` can write a real row instead of an invented one.
 */
export type RemoteEntitlement = {
  /** RevenueCat has a `klect_pro` entitlement recorded for this app user id. */
  entitled: boolean;
  /** Period end, or null for a non-expiring grant. Can be in the past. */
  expiresAt: Date | null;
  /** RevenueCat's product identifier, e.g. "klect_pro_monthly". Null if absent. */
  productId: string | null;
  /** RevenueCat's own store vocabulary, e.g. "APP_STORE". Null if absent. */
  store: string | null;
};

const SUBSCRIBERS_ENDPOINT = "https://api.revenuecat.com/v1/subscribers";

/** How long to wait before giving up and letting the page render "processing". */
const TIMEOUT_MS = 4000;

/** Whether a server-side RevenueCat secret key is configured. */
export function isRevenueCatSecretConfigured(): boolean {
  return (process.env.REVENUECAT_SECRET_API_KEY ?? "").trim() !== "";
}

/** Nothing found. One shared literal so every miss returns the same shape. */
const NOT_ENTITLED: RemoteEntitlement = {
  entitled: false,
  expiresAt: null,
  productId: null,
  store: null,
};

/** `new Date(raw)` only when `raw` is a usable ISO string, else null. */
function parseDate(raw: unknown): Date | null {
  if (typeof raw !== "string") return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * RevenueCat's v1 subscriber payload, narrowed to what an `Entitlement` row needs.
 * Parsed defensively rather than with a schema: an unrecognised shape should
 * degrade to "not entitled", never throw.
 *
 * The store lives one level away from the entitlement. `subscriber.entitlements`
 * says *whether* the user is entitled and until when; `subscriber.subscriptions`,
 * keyed by product identifier, says where it was bought. So the product id from the
 * first is used to look up the second, and a missing or mismatched key just leaves
 * `store` null (the column has a fallback chain in `core/revenuecat.ts`).
 */
function readProEntitlement(payload: unknown): RemoteEntitlement {
  const root = asRecord(payload);
  const subscriber = asRecord(root?.subscriber);
  const entitlements = asRecord(subscriber?.entitlements);
  const pro = asRecord(entitlements?.[PRO_ENTITLEMENT_ID]);
  if (!pro) return NOT_ENTITLED;

  // A null/absent expires_date means a non-expiring grant, which counts as active.
  const expiresAt = parseDate(pro.expires_date);
  const productId =
    typeof pro.product_identifier === "string" && pro.product_identifier
      ? pro.product_identifier
      : null;

  const subscriptions = asRecord(subscriber?.subscriptions);
  const subscription = productId ? asRecord(subscriptions?.[productId]) : null;
  const store =
    typeof subscription?.store === "string" && subscription.store
      ? subscription.store
      : null;

  return { entitled: true, expiresAt, productId, store };
}

/**
 * Ask RevenueCat what it currently holds for `appUserId`, or null if it could not
 * be reached or understood.
 *
 * `appUserId` is Klect's own `User.id` — the same identifier every checkout URL
 * carries and the same one the webhook resolves against.
 *
 * Null is "I do not know" and is never a grant or a revocation: no key configured,
 * a network failure, a timeout, or any non-404 error status. A 404 is a real answer
 * (RevenueCat has never seen this id, so nothing was purchased under it) and comes
 * back as a not-entitled result rather than null. Callers on a write path must
 * treat null as "change nothing" — see the file header.
 */
export async function getRemoteEntitlement(
  appUserId: string,
): Promise<RemoteEntitlement | null> {
  const key = (process.env.REVENUECAT_SECRET_API_KEY ?? "").trim();
  if (!key || !appUserId) return null;

  try {
    const res = await fetch(`${SUBSCRIBERS_ENDPOINT}/${encodeURIComponent(appUserId)}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (res.status === 404) return NOT_ENTITLED;
    if (!res.ok) {
      console.warn(`[revenuecat] subscriber lookup returned ${res.status}.`);
      return null;
    }

    return readProEntitlement(await res.json());
  } catch (err) {
    console.warn("[revenuecat] subscriber lookup failed:", err);
    return null;
  }
}

/**
 * Ask RevenueCat whether `appUserId` currently holds the `klect_pro` entitlement.
 *
 * The read-only, cosmetic question the checkout-success screen asks. A thin reading
 * of {@link getRemoteEntitlement}: null collapses to "unknown", and an entitlement
 * whose period has already passed is "inactive" rather than "active", the same rule
 * `isEntitlementActive` applies locally.
 */
export async function getRemoteProStatus(appUserId: string): Promise<RemoteProStatus> {
  const remote = await getRemoteEntitlement(appUserId);
  if (!remote) return "unknown";
  if (!remote.entitled) return "inactive";
  return remote.expiresAt === null || remote.expiresAt > new Date()
    ? "active"
    : "inactive";
}
