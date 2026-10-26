import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  ACTIVE_STATUS,
  isEntitlementActive,
  type EntitlementStatus,
  type EntitlementStore,
} from "./entitlements";
import { clearLocks } from "./active-selection";
import {
  getRemoteEntitlement,
  isRevenueCatSecretConfigured,
} from "@/lib/revenuecat-remote";

/**
 * The brain behind the RevenueCat webhook: turns one subscription lifecycle event
 * into the user's `Entitlement` row.
 *
 * RevenueCat is the source of truth for *billing*; this row is the local mirror so
 * a cap check (see entitlements.ts) is a database read and never a network call on
 * the write path. The route handler at `app/api/webhooks/revenuecat/route.ts` owns
 * the HTTP concerns (raw body, signature, status codes) and nothing else; every
 * decision about what the row should become lives here, matching the "one brain,
 * two transports" rule the rest of core follows.
 *
 * ## Assumption this whole file rests on: app_user_id IS Klect's User.id
 *
 * `event.app_user_id` is resolved directly as `User.id`. That only holds if the
 * purchase-side SDK integrations identify the user to RevenueCat with Klect's own
 * internal user id (`Purchases.logIn(session.user.id)` on mobile in Stage 6, and the
 * equivalent before Web Billing checkout in Stage 7) rather than letting
 * RevenueCat mint an anonymous `$RCAnonymousID:...`. If either integration ships
 * without that, every webhook here lands on an id that matches no Klect user, and
 * {@link applyRevenueCatEvent} returns `ignored_unknown_user` instead of silently
 * writing a row for a stranger. That outcome is logged loudly by the route handler
 * precisely so a broken Stage 6/7 integration shows up as noise rather than as
 * entitlements that quietly never arrive.
 *
 * ## A lapse sets no flag; a resubscribe clears the locks
 *
 * The two directions are deliberately asymmetric.
 *
 * Downward, an expiration that leaves a user holding more than the free tier allows
 * writes `status: "expired"` and stops. "Not pro, and over the cap, with nothing
 * locked yet" is itself the signal the selection flow reads (Stage 4); there is no
 * separate "needs selection" flag to set, and inventing one would give the same fact
 * two homes that can disagree.
 *
 * ## TRANSFER is the third direction: sideways
 *
 * Apple and Google let the same store account's purchase end up attached to a
 * different app user id, and RevenueCat reports that as TRANSFER. On Klect the
 * everyday cause is not some future account-merge feature, it is ordinary account
 * switching on a shared device: sign out of A, sign in as B, restore purchases.
 *
 * Ignoring it (which this file used to do) gets both halves wrong at once. A keeps
 * `status: "active"` forever, because no further event will ever arrive under A's id
 * to expire it, so a free account holds pro indefinitely. B never gets a row at all,
 * so RevenueCat bills someone who is not pro in Klect. See {@link handleTransfer}.
 *
 * Upward, a transition into a genuinely active entitlement calls `clearLocks` from
 * active-selection.ts, which is Stage 4's stated contract: locks are physically
 * cleared on resubscribe rather than left dormant, so `lockedAt` stays
 * self-describing in every read path and a later lapse can never snap an old,
 * unchosen set of rows back to locked. `clearLocks` is idempotent, so running it on
 * every renewal rather than only on the first purchase costs one no-op query and
 * removes the need to reason about which event type counts as "the" reactivation.
 */

/**
 * The entitlement identifier configured in the RevenueCat dashboard (Stage 2).
 * Events that carry an explicit `entitlement_ids` list without this value are
 * about some other product and are ignored.
 */
export const PRO_ENTITLEMENT_ID = "klect_pro";

/**
 * The subset of RevenueCat's webhook payload this handler reads.
 *
 * Shape per RevenueCat's "Event Types and Fields" documentation: the request body
 * is `{ api_version, event: { ... } }`. Unknown keys are stripped rather than
 * rejected (zod's default), which is deliberate: RevenueCat adds fields and event
 * types over time, and a webhook that 400s because a new key appeared is a webhook
 * that silently stops syncing entitlements.
 *
 * Almost everything is optional because the field set genuinely varies by event
 * type (a TEST event carries far less than a RENEWAL). Only `id` and `type` are
 * required, because without those there is no event to process and no way to dedupe it.
 */
const revenueCatEventSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  app_user_id: z.string().min(1).nullish(),
  original_app_user_id: z.string().min(1).nullish(),
  event_timestamp_ms: z.number().nullish(),
  expiration_at_ms: z.number().nullish(),
  product_id: z.string().min(1).nullish(),
  store: z.string().min(1).nullish(),
  environment: z.string().min(1).nullish(),
  period_type: z.string().min(1).nullish(),
  entitlement_ids: z.array(z.string()).nullish(),
  cancel_reason: z.string().min(1).nullish(),
  /**
   * TRANSFER only: the app user ids an entitlement moved off, and the ones it moved
   * onto. Arrays because RevenueCat models a transfer as a set operation on both
   * sides, and a TRANSFER carries these *instead of* describing a subscription, so
   * neither side's plan, store, or expiry is in the payload. See {@link handleTransfer}.
   */
  transferred_from: z.array(z.string()).nullish(),
  transferred_to: z.array(z.string()).nullish(),
});

export const revenueCatWebhookSchema = z.object({
  api_version: z.string().nullish(),
  event: revenueCatEventSchema,
});

export type RevenueCatEvent = z.infer<typeof revenueCatEventSchema>;

/**
 * Lifecycle event type to the local {@link EntitlementStatus} vocabulary. The three
 * statuses come from Stage 1 (entitlements.ts) and are not extended here: only
 * "active" grants pro, so "grace" and "expired" differ for diagnostics, not access.
 *
 * Notes on the less obvious rows:
 *
 *  - CANCELLATION maps to "active", not "expired". In RevenueCat a cancellation is
 *    auto-renew being switched off; the user keeps access until the period ends,
 *    and a separate EXPIRATION event fires then. The refund flavour of CANCELLATION
 *    (`cancel_reason: "CUSTOMER_SUPPORT"`) needs no special case either, because
 *    RevenueCat sets `expiration_at_ms` to the refund time and `isEntitlementActive`
 *    treats a past `expiresAt` as lapsed regardless of a stale "active" status.
 *  - BILLING_ISSUE maps to "grace", which entitlements.ts defines as lapsed. Being
 *    strict here is the safe direction: the worst case is a user with a genuinely
 *    failing card briefly losing pro, and a RENEWAL restores it the moment the
 *    charge succeeds.
 *  - SUBSCRIPTION_PAUSED (Play Store) maps to "expired" because a paused
 *    subscription grants no access; the RENEWAL on resume reactivates it.
 *
 * Any type absent from this map is deliberately unhandled. The handler returns 200
 * for those so RevenueCat stops retrying something that was never an error.
 *
 * TRANSFER is absent on purpose and is *not* unhandled: it never reaches this map,
 * because {@link handleTransfer} intercepts it first. It cannot be a row here. A
 * transfer moves an entitlement between app user ids and carries
 * `transferred_from` / `transferred_to` instead of describing one subscriber, so
 * there is no single status and no single user to upsert onto.
 */
const STATUS_BY_EVENT_TYPE: Readonly<Record<string, EntitlementStatus>> = {
  INITIAL_PURCHASE: "active",
  NON_RENEWING_PURCHASE: "active",
  RENEWAL: "active",
  UNCANCELLATION: "active",
  PRODUCT_CHANGE: "active",
  SUBSCRIPTION_EXTENDED: "active",
  TEMPORARY_ENTITLEMENT_GRANT: "active",
  CANCELLATION: "active",
  BILLING_ISSUE: "grace",
  SUBSCRIPTION_PAUSED: "expired",
  EXPIRATION: "expired",
};

/**
 * RevenueCat's `store` vocabulary to ours. `Entitlement.store` is a String column
 * precisely because RevenueCat owns this list and keeps adding to it, so a store we
 * have no mapping for (AMAZON, ROKU, PADDLE, PROMOTIONAL, TEST_STORE) is written
 * through lowercased rather than dropped or forced into the wrong bucket. Nothing
 * branches on this field today; it exists so support can tell where a subscription
 * was bought when a user asks.
 */
const STORE_BY_REVENUECAT_STORE: Readonly<Record<string, EntitlementStore>> = {
  APP_STORE: "app_store",
  MAC_APP_STORE: "app_store",
  PLAY_STORE: "play_store",
  STRIPE: "stripe",
  RC_BILLING: "stripe",
};

function mapStore(store: string | null | undefined): string | null {
  if (!store) return null;
  return STORE_BY_REVENUECAT_STORE[store.toUpperCase()] ?? store.toLowerCase();
}

/**
 * The `Entitlement.store` value that marks a hand-granted comp row rather than a real
 * purchase, written by `scripts/seed-comp-access.ts`.
 *
 * Deliberately outside the {@link EntitlementStore} union, which enumerates only the stores
 * RevenueCat can send; the column is a plain String precisely so a non-store value like this
 * is representable. {@link isSuperseded} is the only logic that reads it; no access decision
 * does. The literal is repeated in the seed script because that script runs under `tsx` with
 * no path aliases and must not pull this server-only module (and `@/lib/db` with it) into a
 * one-off CLI process. Changing the string means changing it in both places.
 */
export const COMP_STORE = "comp";

/**
 * How far along the lapse path a status sits. Used only by {@link isSuperseded} to
 * refuse backwards moves inside a single billing period; it is not an access check.
 */
function statusRank(status: string): number {
  if (status === "active") return 0;
  if (status === "grace") return 1;
  return 2; // "expired", and anything unrecognised, is treated as the end state.
}

/**
 * Whether an incoming event describes an *older* state than the row already holds,
 * and should therefore be dropped.
 *
 * This is the durable half of the idempotency story, and it is what makes replay
 * safe across serverless instances where an in-memory event-id cache cannot help.
 * It leans on one property of the data: within a subscription's real lifecycle the
 * period end only ever moves forward, because each renewal pushes `expiration_at_ms`
 * out. So the stored `expiresAt` doubles as a version number that no extra column
 * has to carry.
 *
 *  - Later period end than stored: a genuinely newer event. Apply.
 *  - Earlier period end than stored: an event from a period we have already moved
 *    past (a delayed or replayed EXPIRATION arriving after the RENEWAL that saved
 *    it). Drop, or it would downgrade a paying user.
 *  - Same period end: apply only if the status does not move backwards. Within one
 *    period the lifecycle runs active to grace to expired and never the reverse, so
 *    this is what stops a re-delivered CANCELLATION from resurrecting an entitlement
 *    the matching EXPIRATION already closed. Re-delivering the *same* event lands on
 *    equal rank, which still applies and rewrites byte-identical values, so a replay
 *    is a no-op rather than a rejection.
 *
 * A null `expiresAt` on either side means "no known expiry" (a lifetime or
 * promotional grant) and sorts as infinitely far in the future, so a finite-period
 * event can never clobber a lifetime grant. The flip side, worth knowing before
 * anyone adds one: once a row holds a null `expiresAt`, every later finite-period
 * event is treated as superseded and dropped. That is correct for a grant that
 * genuinely never ends, and harmless today because Klect only sells a monthly and an
 * annual subscription, both of which always carry an `expiration_at_ms`. Introducing
 * a lifetime product means revisiting this branch, not working around it.
 *
 * ## The comp exception
 *
 * A stored row with `store: {@link COMP_STORE}` is never treated as newer than an
 * incoming event, whatever its expiry says. The "expiry is a version number" premise
 * this whole function rests on holds only for rows that came from a real subscription
 * lifecycle, where each renewal pushes the period end forward. A comp row's expiry is
 * not a period end at all: it is a hand-picked far-future date, so under the ordinary
 * rule *every* real event (purchase, renewal, cancellation, all with nearer, finite
 * expiries) compares as older and is dropped, and the webhook still answers 200. That
 * is the exact failure mode the comp accounts exist to rule out: a QA or owner account
 * on which the subscription pipeline silently does nothing.
 *
 * Kept as narrow as the TRANSFER exception below it, and in the same shape: it keys on
 * one explicit marker, it only ever lets a real event *through*, and it never blocks
 * anything. It cannot revoke the comp grant on its own, either: the grant ends only
 * if a real event actually arrives for that user, and re-running the seed script puts
 * it back.
 *
 * Pure and exported so the rule can be reasoned about, and exercised directly, if a
 * test runner is ever adopted.
 */
export function isSuperseded(
  stored: { status: string; expiresAt: Date | null; store?: string | null } | null,
  incoming: { status: EntitlementStatus; expiresAt: Date | null },
): boolean {
  if (!stored) return false;
  // See "The comp exception" above: a comp row's expiry is not a period end, so it must
  // not be compared as one.
  if (stored.store === COMP_STORE) return false;

  const storedEnd = stored.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const incomingEnd = incoming.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;

  if (incomingEnd > storedEnd) return false;
  if (incomingEnd < storedEnd) return true;
  return statusRank(incoming.status) < statusRank(stored.status);
}

/**
 * Best-effort, per-process record of event ids already handled.
 *
 * The cheap first line of the two-layer dedupe: RevenueCat retries a failed or slow
 * delivery at 5, 10, 20, 40 and 80 minutes, and those retries usually land on the
 * same warm instance, where this short-circuits them before any database work. It is
 * ephemeral and not shared across instances (same accepted tradeoff as core/cache.ts
 * and for the same reason: no new infrastructure), which is exactly why
 * {@link isSuperseded} exists underneath it. Correctness never depends on this map;
 * only the saved round-trip does.
 *
 * The durable version is a `processedEventId` column on `Entitlement`, or a small
 * `WebhookEvent` table with a unique index on the event id. Both are schema changes,
 * which this slice deliberately does not make, so they are a follow-up rather than a
 * silent gap.
 */
const EVENT_TTL_MS = 6 * 60 * 60 * 1000; // Comfortably past the ~155-minute retry schedule.
const MAX_TRACKED_EVENTS = 1000;
const seenEventIds = new Map<string, number>();

/** Whether this process already finished handling this event id inside the TTL. */
export function wasEventSeen(eventId: string, now: number = Date.now()): boolean {
  const seenAt = seenEventIds.get(eventId);
  return seenAt !== undefined && now - seenAt < EVENT_TTL_MS;
}

/**
 * Record an event id as fully handled.
 *
 * Call this only *after* the event is done with, never before. Marking it up front
 * would mean a failed write turned RevenueCat's own retry into a silent "already
 * handled" 200 on the same warm instance, which loses the event for good: the user
 * paid and never becomes pro.
 */
export function markEventSeen(eventId: string, now: number = Date.now()): void {
  seenEventIds.delete(eventId); // Re-insert so Map iteration order stays newest-last.
  seenEventIds.set(eventId, now);

  if (seenEventIds.size > MAX_TRACKED_EVENTS) {
    for (const [id, at] of seenEventIds) {
      if (now - at >= EVENT_TTL_MS) seenEventIds.delete(id);
    }
    while (seenEventIds.size > MAX_TRACKED_EVENTS) {
      const oldest = seenEventIds.keys().next().value;
      if (oldest === undefined) break;
      seenEventIds.delete(oldest);
    }
  }
}

/** Why an event did or did not change the row. Every value is a 200 to RevenueCat. */
export type ApplyOutcome =
  | "applied"
  | "ignored_duplicate"
  | "ignored_event_type"
  | "ignored_other_entitlement"
  | "ignored_unknown_user"
  | "ignored_superseded"
  /** A TRANSFER that named no ids on either side, so there was nothing to move. */
  | "ignored_transfer_no_ids";

export type ApplyResult = {
  outcome: ApplyOutcome;
  /** One short line for the log. Never contains anything secret. */
  detail: string;
};

/**
 * Apply one RevenueCat lifecycle event to `userId`'s entitlement row.
 *
 * `userId` is `event.app_user_id`, resolved as Klect's own `User.id` (see the file
 * header). TRANSFER is the one exception and ignores this argument entirely: it
 * carries no single subscriber, so {@link handleTransfer} works from the event's own
 * `transferred_from` / `transferred_to` ids instead. The route passes an empty string
 * for a TRANSFER that arrives without an `app_user_id`, which is normal for that type.
 *
 * Safe to call twice with the same event: the write is a deterministic function of
 * the payload, and {@link isSuperseded} refuses anything that would move the row
 * backwards, so a replay either rewrites identical values or is dropped outright
 * (TRANSFER bypasses that rule but is idempotent in its own right; see
 * {@link handleTransfer}).
 *
 * Never throws for an event it simply does not act on; those come back as an
 * `ignored_*` outcome so the caller can answer 200 and stop RevenueCat retrying a
 * non-problem. A genuine database failure still throws, which the route handler
 * turns into a 500 so the retry schedule does its job.
 */
export async function applyRevenueCatEvent(
  userId: string,
  event: RevenueCatEvent,
): Promise<ApplyResult> {
  if (wasEventSeen(event.id)) {
    return { outcome: "ignored_duplicate", detail: `event ${event.id} already handled` };
  }

  const result = await handleEvent(userId, event);

  // Reached only on a normal return. A throw deliberately skips this so RevenueCat's
  // retry gets a real second attempt rather than a "duplicate" brush-off.
  markEventSeen(event.id);
  return result;
}

async function handleEvent(userId: string, event: RevenueCatEvent): Promise<ApplyResult> {
  // Intercepted before the status map and before `userId` is used at all: a TRANSFER
  // is about the ids in `transferred_from` / `transferred_to`, not about the single
  // subscriber the rest of this function assumes.
  if (event.type === "TRANSFER") return handleTransfer(event);

  const status = STATUS_BY_EVENT_TYPE[event.type];
  if (!status) {
    return { outcome: "ignored_event_type", detail: `no mapping for type ${event.type}` };
  }

  // Only act on the pro entitlement. An empty or absent list means RevenueCat did
  // not scope the event, so it is treated as relevant rather than discarded.
  const entitlementIds = event.entitlement_ids;
  if (entitlementIds && entitlementIds.length > 0 && !entitlementIds.includes(PRO_ENTITLEMENT_ID)) {
    return {
      outcome: "ignored_other_entitlement",
      detail: `event targets ${entitlementIds.join(", ")}, not ${PRO_ENTITLEMENT_ID}`,
    };
  }

  // Resolve app_user_id as our own User.id (see the file header). Checking first
  // keeps a mismatch a diagnosable ignore instead of a foreign-key crash that
  // RevenueCat would then retry five times.
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) {
    return { outcome: "ignored_unknown_user", detail: `no Klect user for app_user_id ${userId}` };
  }

  const expiresAt = event.expiration_at_ms ? new Date(event.expiration_at_ms) : null;
  const existing = await prisma.entitlement.findUnique({ where: { userId } });

  if (isSuperseded(existing, { status, expiresAt })) {
    return {
      outcome: "ignored_superseded",
      detail: `event ${event.id} (${event.type}) is older than the stored entitlement`,
    };
  }

  // `store` and `plan` are non-null columns, so a payload missing them falls back to
  // what is already on the row before a last-resort placeholder. Both are descriptive
  // only; no access decision reads them.
  const data = {
    store: mapStore(event.store) ?? existing?.store ?? "unknown",
    plan: event.product_id ?? existing?.plan ?? "unknown",
    status,
    expiresAt,
    revenueCatAppUserId: event.original_app_user_id ?? event.app_user_id ?? null,
  };

  const entitlement = await prisma.entitlement.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });

  // Judge "is the user actually pro now" with the same function every read path uses
  // rather than re-deriving it from `status` alone: a stale "active" on a row whose
  // period has already passed must not unlock anything.
  let unlocked = "";
  if (isEntitlementActive(entitlement)) {
    const cleared = await clearLocks(userId);
    if (cleared.lists > 0 || cleared.bookmarks > 0) {
      unlocked = ` unlocked=${cleared.lists} list(s)/${cleared.bookmarks} bookmark(s)`;
    }
  }

  return {
    outcome: "applied",
    detail:
      `${event.type} -> status=${status} ` +
      `expiresAt=${expiresAt?.toISOString() ?? "null"}${unlocked}`,
  };
}
/** The status a `transferred_from` row is forced to. Typed so it cannot drift. */
const EXPIRED_STATUS: EntitlementStatus = "expired";

/**
 * Apply a TRANSFER: an entitlement moved from one set of app user ids to another.
 *
 * ## Why this is not just another upsert
 *
 * Every other event names one subscriber and describes their subscription. A
 * TRANSFER names two sets of ids and describes neither side's subscription: no
 * `expiration_at_ms`, no `product_id`, no usable `store`. So the two halves need
 * different treatment, and both are needed.
 *
 *  - `transferred_from`: expire the row. The payload is enough on its own, because
 *    "this id no longer holds the entitlement" is exactly what the event says. This
 *    half closes a revenue leak: without it no further event ever arrives under that
 *    id, so a stale `status: "active"` row grants pro forever, for free.
 *  - `transferred_to`: ask RevenueCat what the receiving id actually holds, via
 *    {@link getRemoteEntitlement}, and write that. Guessing is not an option here
 *    (a fabricated expiry is a fabricated entitlement), and skipping it leaves a
 *    paying user on the free tier.
 *
 * ## The deliberate exception to {@link isSuperseded}
 *
 * Neither half goes through `isSuperseded`, and that is the point rather than an
 * oversight. That rule exists to stop a *delayed or replayed* event from moving a
 * row backwards inside one billing period, and it enforces it by comparing period
 * ends. A transfer moves state backwards legitimately and without changing any
 * period end: the losing id's entitlement ends while its stored `expiresAt` stays
 * exactly where it was, so the comparison reads "same period, status moving
 * active to expired" and drops the one event that must not be dropped.
 *
 * The exception is kept as narrow as it can be. It applies to TRANSFER only, to the
 * ids the event itself names, and the receiving side writes RevenueCat's live answer
 * rather than anything inferred from the event, so the ordering protection is not
 * being traded away: it is being replaced, for this one event type, by a stronger
 * source of truth. Replay stays safe because both halves are idempotent (expiring an
 * expired row is a no-op; re-reading the subscriber yields the same values).
 *
 * ## Failure behaviour
 *
 * Fails closed in every direction. An id that matches no Klect user or no entitlement
 * row is skipped, not invented. If RevenueCat cannot be reached for a
 * `transferred_to` id this throws, which the route turns into a 500 so the retry
 * schedule re-attempts the grant rather than losing it. The one case that is logged
 * and moved past is a missing server secret key, because retrying a configuration
 * problem five times does not fix it; the `transferred_from` half still lands, which
 * is the half that costs money.
 */
async function handleTransfer(event: RevenueCatEvent): Promise<ApplyResult> {
  // Scoping check, same rule the other event types get in `handleEvent`: an empty or
  // absent list means RevenueCat did not scope the event, so treat it as relevant.
  const entitlementIds = event.entitlement_ids;
  if (entitlementIds && entitlementIds.length > 0 && !entitlementIds.includes(PRO_ENTITLEMENT_ID)) {
    return {
      outcome: "ignored_other_entitlement",
      detail: `transfer targets ${entitlementIds.join(", ")}, not ${PRO_ENTITLEMENT_ID}`,
    };
  }

  const from = [...new Set(event.transferred_from ?? [])].filter(Boolean);
  const to = [...new Set(event.transferred_to ?? [])].filter(Boolean);
  if (from.length === 0 && to.length === 0) {
    return {
      outcome: "ignored_transfer_no_ids",
      detail: `transfer ${event.id} named no transferred_from or transferred_to ids`,
    };
  }

  const expired = await revokeTransferredFrom(from);
  const { granted, skippedUnconfigured } = await grantTransferredTo(to);

  const notes = skippedUnconfigured
    ? " (transferred_to skipped: no REVENUECAT_SECRET_API_KEY)"
    : "";
  return {
    outcome: "applied",
    detail:
      `TRANSFER -> expired ${expired}/${from.length} losing id(s), ` +
      `granted ${granted}/${to.length} receiving id(s)${notes}`,
  };
}

/**
 * Expire the entitlement row behind each id that lost the entitlement. Returns how
 * many rows actually changed.
 *
 * Resolution matches the rest of this file: an app user id is Klect's own `User.id`,
 * so `Entitlement.userId` is the primary key to look under. The
 * `revenueCatAppUserId` fallback covers the one case the primary lookup cannot: a row
 * written from an event whose `original_app_user_id` differs from the id now being
 * transferred away (a purchase that began anonymous, for instance).
 */
async function revokeTransferredFrom(appUserIds: string[]): Promise<number> {
  let changed = 0;

  for (const appUserId of appUserIds) {
    const existing =
      (await prisma.entitlement.findUnique({ where: { userId: appUserId } })) ??
      (await prisma.entitlement.findFirst({ where: { revenueCatAppUserId: appUserId } }));

    // No row means this id never held a Klect entitlement. Nothing to revoke, and
    // nothing to create: a transfer is not a purchase.
    if (!existing) continue;
    if (existing.status === EXPIRED_STATUS) continue;

    // `expiresAt` is left exactly as it was. It is the version number isSuperseded
    // compares against, and the period genuinely did not change; what changed is who
    // the period belongs to. Rewriting it would corrupt the ordering for this user's
    // own later events.
    await prisma.entitlement.update({
      where: { id: existing.id },
      data: { status: EXPIRED_STATUS },
    });
    changed += 1;
  }

  return changed;
}

/**
 * Write RevenueCat's live truth for each id that received the entitlement. Returns
 * how many rows were written, and whether the whole half was skipped for want of a
 * server secret key.
 *
 * Throws if RevenueCat cannot be reached for a resolvable user, so the delivery is
 * retried rather than silently losing someone's access.
 */
async function grantTransferredTo(
  appUserIds: string[],
): Promise<{ granted: number; skippedUnconfigured: boolean }> {
  if (appUserIds.length === 0) return { granted: 0, skippedUnconfigured: false };

  if (!isRevenueCatSecretConfigured()) {
    // Loud, and not retried: five retries will not conjure an API key, and the
    // transferred_from half above has already landed.
    console.error(
      "[revenuecat] TRANSFER received but REVENUECAT_SECRET_API_KEY is unset, " +
        "so the receiving user(s) cannot be granted pro. Set the key and re-send " +
        "the event from the RevenueCat dashboard.",
    );
    return { granted: 0, skippedUnconfigured: true };
  }

  let granted = 0;

  for (const appUserId of appUserIds) {
    const user = await prisma.user.findUnique({
      where: { id: appUserId },
      select: { id: true },
    });
    // Same diagnosable-ignore as the main path: an id matching no Klect user means
    // the SDK identified the purchase with something other than our User.id.
    if (!user) {
      console.warn(`[revenuecat] transferred_to id ${appUserId} matches no Klect user.`);
      continue;
    }

    const remote = await getRemoteEntitlement(appUserId);
    if (!remote) {
      // "I do not know" is never written. Throwing hands the decision back to
      // RevenueCat's retry schedule, which is the only thing that can fix it.
      throw new Error(
        `RevenueCat subscriber lookup failed for transferred_to id ${appUserId}.`,
      );
    }

    // RevenueCat moved the entitlement here but no longer reports it. Nothing to
    // grant; the row (if any) stays as it is rather than being invented or wiped.
    if (!remote.entitled) continue;

    const data = {
      store: mapStore(remote.store) ?? "unknown",
      plan: remote.productId ?? "unknown",
      status: ACTIVE_STATUS,
      expiresAt: remote.expiresAt,
      revenueCatAppUserId: appUserId,
    };

    const entitlement = await prisma.entitlement.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...data },
      update: data,
    });
    granted += 1;

    // Same rule as the main path: judge "actually pro" with the shared function, and
    // clear locks on the way in so a transferred-in subscriber sees all their data.
    if (isEntitlementActive(entitlement)) await clearLocks(user.id);
  }

  return { granted, skippedUnconfigured: false };
}
