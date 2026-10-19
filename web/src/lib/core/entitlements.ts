import "server-only";
import { prisma } from "@/lib/db";
import { type EntitlementModel } from "@/generated/prisma/models";

/**
 * Free-tier capacity limits and the paid-entitlement check behind them.
 *
 * Klect is freemium: the free tier caps how much a user can *own* (3 lists, 20
 * bookmarks inside those lists); the paid "pro" entitlement removes both caps.
 * Collaboration is never gated, so joining, viewing, or editing someone else's
 * list, plus comments, DMs, group chat, polls, and friends, stay free no matter
 * how many there are. Only ownership counts.
 *
 * Everything here is a local database read. The `Entitlement` row is mirrored from
 * RevenueCat by the webhook handler so a cap check never makes a network call on
 * the write path, and never fails open because RevenueCat was slow.
 *
 * The `assertCanCreate*` guards are wired into `core.createList`,
 * `core.createBookmark`, and `core.createBookmarkInLists`. Each caller decides
 * which of its target lists the user actually owns and passes that count, because
 * only owned capacity is capped.
 */

/** Maximum lists a free user can own at once. Locked lists do not count. */
export const FREE_LIST_LIMIT = 3;

/** Maximum bookmarks a free user can own at once. Locked bookmarks do not count. */
export const FREE_BOOKMARK_LIMIT = 20;

/**
 * Which billing path paid for an entitlement. A String column rather than a Prisma
 * enum because RevenueCat owns this vocabulary and adds to it (see the comment on
 * the model in schema.prisma); this union is the app-side checked version.
 */
export type EntitlementStore = "app_store" | "play_store" | "stripe";

/**
 * Lifecycle state of an entitlement, mirrored from RevenueCat. "grace" is a failed
 * renewal that RevenueCat is still retrying, which counts as lapsed here: only
 * "active" grants pro. Same String-not-enum reasoning as {@link EntitlementStore}.
 */
export type EntitlementStatus = "active" | "expired" | "grace";

/** The one `status` value that grants pro. Use this instead of a bare string literal. */
export const ACTIVE_STATUS: EntitlementStatus = "active";

/**
 * The user's entitlement row, or null when they have none. A missing row is the
 * normal free-tier state, not an error: no row is created at signup, only by the
 * RevenueCat webhook on first purchase.
 */
export function getEntitlement(userId: string): Promise<EntitlementModel | null> {
  return prisma.entitlement.findUnique({ where: { userId } });
}

/**
 * Whether an entitlement row grants pro right now. Pure, so the rule can be checked
 * without touching the database. Both halves matter: a row can carry a stale "active"
 * status if a webhook was missed or arrived out of order, so a past `expiresAt` wins
 * over the status. A null `expiresAt` means no known expiry (a lifetime or
 * promotional grant) and stays active.
 */
export function isEntitlementActive(
  entitlement: EntitlementModel | null,
  now: Date = new Date(),
): boolean {
  if (!entitlement) return false;
  if (entitlement.status !== ACTIVE_STATUS) return false;
  return entitlement.expiresAt === null || entitlement.expiresAt > now;
}

/** Whether the user currently has the paid "pro" entitlement. */
export async function isPro(userId: string): Promise<boolean> {
  return isEntitlementActive(await getEntitlement(userId));
}

/**
 * Lists the user owns that count against the free cap. Locked lists are excluded:
 * they are already inaccessible, so letting them hold quota hostage would strand a
 * lapsed user below their own limit with no way to recover.
 */
export function countActiveOwnedLists(userId: string): Promise<number> {
  return prisma.list.count({ where: { ownerId: userId, lockedAt: null } });
}

/**
 * Bookmarks the user owns that count against the free cap. Ownership is indirect:
 * a bookmark belongs to a list, so "owned" means it sits in a list whose `ownerId`
 * is this user. Bookmarks the user added to someone else's list are somebody else's
 * capacity, never counted here.
 *
 * Excludes both locked bookmarks and every bookmark inside a locked list, for the
 * same reason {@link countActiveOwnedLists} excludes locked lists: a locked list is
 * wholly inaccessible, so its contents should not consume quota either.
 */
export function countActiveOwnedBookmarks(userId: string): Promise<number> {
  return prisma.bookmark.count({
    where: { lockedAt: null, list: { ownerId: userId, lockedAt: null } },
  });
}

/**
 * Thrown when a free user's action would take them past a free-tier cap.
 *
 * Deliberately a subclass of `Error` rather than a new error mechanism: core
 * mutations signal refusal by throwing an `Error` with a human-readable message
 * (see `assertRole` in lib/permissions.ts), and every transport already surfaces
 * `.message` correctly, so this behaves identically to what is already there. The
 * extra fields exist because the paywall stages have to tell "you hit a cap, here
 * is the upgrade screen" apart from "something broke", and matching on the text of
 * a message is the kind of thing that silently stops working when someone reworks
 * the copy.
 */
export class FreeLimitError extends Error {
  /** Which cap was hit, for routing to the right paywall copy. */
  readonly limit: "lists" | "bookmarks";
  /** The cap itself, and how many the user already has, for the upgrade screen. */
  readonly max: number;
  readonly current: number;

  constructor(limit: "lists" | "bookmarks", max: number, current: number, message: string) {
    super(message);
    this.name = "FreeLimitError";
    this.limit = limit;
    this.max = max;
    this.current = current;
  }
}

/** Narrow an unknown caught value to a {@link FreeLimitError}. */
export function isFreeLimitError(e: unknown): e is FreeLimitError {
  return e instanceof FreeLimitError;
}

/*
 * ---------------------------------------------------------------------------
 * THE TWO GUARDS BELOW ARE NON-ATOMIC, AND THAT IS A DECISION, NOT AN OVERSIGHT
 * ---------------------------------------------------------------------------
 * `assertCanCreateList` and `assertCanCreateBookmark` count, return, and then let
 * the caller write. There is no transaction, no row lock, and no database
 * constraint spanning the two steps, so the pattern is a genuine time-of-check to
 * time-of-use race: two requests from the same user that interleave between the
 * count and the insert can both pass a guard that only one of them should have.
 *
 * Deliberately left as-is. Triggering it takes deliberately concurrent writes from
 * one account (nothing in either client issues them; both create flows are a single
 * submit that awaits its own result), the damage is bounded to a handful of rows
 * over the cap, and it is self-correcting: the very next create is refused, and the
 * downgrade-selection flow in active-selection.ts already exists to bring an
 * over-cap account back under the limit without deleting anything. Making it atomic
 * means either wrapping every create path in a serializable transaction or adding a
 * maintained counter column with a check constraint, both of which cost real
 * complexity across two transports to close a hole whose worst outcome is a free
 * user briefly holding 21 bookmarks.
 *
 * Revisit if the caps ever become a hard contractual limit rather than a product
 * nudge, or if a batch/import path that writes many rows per request ships. Until
 * then: do not assume these are race-safe, and do not "fix" it in passing without
 * weighing that cost.
 */

/**
 * Throw unless the user may create `adding` more owned lists. No-op for pro users.
 *
 * `adding` defaults to 1 for the ordinary single-create path; the multi-list
 * bookmark-create flow creates several lists in one call and should pass the real
 * count, so a free user with 2 lists cannot slip 3 new ones in at once.
 */
export async function assertCanCreateList(userId: string, adding = 1): Promise<void> {
  if (await isPro(userId)) return;

  const current = await countActiveOwnedLists(userId);
  if (current + adding > FREE_LIST_LIMIT) {
    throw new FreeLimitError(
      "lists",
      FREE_LIST_LIMIT,
      current,
      `Free accounts can have ${FREE_LIST_LIMIT} lists. Upgrade to add more.`,
    );
  }
}

/**
 * Throw unless the user may create `adding` more owned bookmarks. No-op for pro users.
 *
 * Caller contract: only call this when the new bookmarks land in lists the user
 * owns. Adding a bookmark to someone else's list is collaboration, which is never
 * capped, so the caller filters its target lists by ownership first and passes only
 * that count as `adding`. This function takes no list id and cannot make that
 * judgment itself.
 */
export async function assertCanCreateBookmark(userId: string, adding = 1): Promise<void> {
  if (await isPro(userId)) return;

  const current = await countActiveOwnedBookmarks(userId);
  if (current + adding > FREE_BOOKMARK_LIMIT) {
    throw new FreeLimitError(
      "bookmarks",
      FREE_BOOKMARK_LIMIT,
      current,
      `Free accounts can save ${FREE_BOOKMARK_LIMIT} bookmarks. Upgrade to save more.`,
    );
  }
}

/**
 * The code that marks a cap refusal on the wire. One constant so neither
 * transport nor either paywall UI retypes the string literal.
 */
export const FREE_LIMIT_CODE = "FREE_LIMIT";

/**
 * {@link FreeLimitError} flattened into plain, serializable data.
 *
 * An `Error` subclass cannot cross either transport intact: a server action
 * returns JSON to the browser, and tRPC sends an error shape to mobile, so both
 * sides would otherwise be left matching on `.message` text. This is the one
 * shape both transports emit and both paywall UIs read, so "you hit the free
 * cap" stays distinguishable from "something broke" without string matching.
 *
 * `ok: false` is the discriminant for server-action callers (success is
 * `undefined`, see {@link CappedCreateResult}); `code` is the discriminant for
 * anyone holding the value on its own, such as mobile reading
 * `error.data.freeLimit`.
 *
 * Client components may import this type (and {@link CappedCreateResult}) with
 * `import type` even though this module is `server-only`: a type-only import is
 * erased at compile time, so nothing from here reaches a client bundle.
 */
export type FreeLimitResult = {
  ok: false;
  code: typeof FREE_LIMIT_CODE;
  /** Which cap was hit, for routing to the right paywall copy. */
  limit: "lists" | "bookmarks";
  /** The cap itself, and how many the user already has, for the upgrade screen. */
  max: number;
  current: number;
  /** Ready-to-show copy, so a caller that only needs a message has one. */
  message: string;
};

/**
 * What a create action that a free-tier cap can refuse returns.
 *
 * `undefined` means the write went through: the existing actions return nothing
 * on success (one of them redirects instead), so this adds the refusal case
 * without inventing a success envelope that every current caller would have to
 * unwrap.
 */
export type CappedCreateResult = FreeLimitResult | undefined;

/** Flatten a caught {@link FreeLimitError} into its serializable form. */
export function toFreeLimitResult(error: FreeLimitError): FreeLimitResult {
  return {
    ok: false,
    code: FREE_LIMIT_CODE,
    limit: error.limit,
    max: error.max,
    current: error.current,
    message: error.message,
  };
}

/**
 * Narrow an unknown value to a {@link FreeLimitResult}. For holders of the
 * deserialized data (a server-action return value, `error.data.freeLimit`),
 * where `instanceof` no longer applies. Use {@link isFreeLimitError} for a
 * caught throw instead.
 */
export function isFreeLimitResult(value: unknown): value is FreeLimitResult {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { code?: unknown }).code === FREE_LIMIT_CODE
  );
}
