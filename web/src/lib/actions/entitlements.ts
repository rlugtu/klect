"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireUser } from "@/lib/session";
import * as core from "@/lib/core/active-selection";
import {
  isFreeLimitError,
  toFreeLimitResult,
  type FreeLimitResult,
} from "@/lib/core/entitlements";
import { createWebCheckoutSession, type CheckoutSession } from "@/lib/checkout";
import { type PlanId } from "@/lib/revenuecat-web";

/**
 * Web's transport over the free-tier entitlement core.
 *
 * "One brain, two transports": every function here is a thin `"use server"`
 * wrapper over `lib/core/active-selection.ts`, the exact same module the tRPC
 * `entitlements` router hands to mobile. No cap rule, no ownership rule, and no
 * count lives in this file. A rule written here would be a rule mobile does not
 * have. The web UI calls these; it never imports `core/*` directly, and it never
 * re-checks a cap client-side.
 *
 * The one thing this layer does own is turning a thrown refusal into a value the
 * browser can read. Server actions serialize their return value, so a
 * `FreeLimitError` crossing back would arrive as Next's generic error boundary;
 * flattening it to {@link FreeLimitResult} (the same shape `createList` and
 * `createBookmark` already return) keeps "you hit a cap" distinguishable from
 * "something broke" without matching on message text.
 */

/** A failed commit: the structured cap refusal, or any other error, flattened. */
export type SelectionFailure =
  | FreeLimitResult
  | { ok: false; code: "ERROR"; message: string };

/**
 * What a committed selection reports back.
 *
 * `nextStep` exists so the screen never has to re-derive "am I done?" from
 * counts it computed before the write. The list step and the bookmark step are
 * two separate commits (core rejects bookmarks inside a list that is still
 * locked, so the list step has to land first), and this is the server telling
 * the client which one comes next.
 */
export type SelectionCommitResult =
  | ({ ok: true; nextStep: "lists" | "bookmarks" | "done" } & core.SelectionResult)
  | SelectionFailure;

/** Flatten anything a commit can throw into a serializable failure. */
function toFailure(e: unknown): SelectionFailure {
  if (isFreeLimitError(e)) return toFreeLimitResult(e);
  return {
    ok: false,
    code: "ERROR",
    message: e instanceof Error && e.message ? e.message : "Something went wrong",
  };
}

/**
 * Which step the screen should show next, read fresh after a commit.
 *
 * Over-cap steps come first because they are owed. Reclaim is checked after them
 * and uses the same ordering the page itself uses (lists before bookmarks, locked
 * lists meaning the list step still has work), so a commit that leaves locked data
 * behind hands off to the next reclaimable step instead of reporting "done" and
 * bouncing the user home with locks they came to collect. "done" now means what it
 * says: nothing owed and nothing left locked.
 */
function stepFor(status: core.SelectionStatus): "lists" | "bookmarks" | "done" {
  if (status.overListLimit) return "lists";
  if (status.overBookmarkLimit) return "bookmarks";
  if (status.canReclaim) {
    return status.lists.some((list) => list.lockedAt !== null) ? "lists" : "bookmarks";
  }
  return "done";
}

/**
 * Free-tier capacity state for the signed-in user: what they own, what the caps
 * are, and whether they are over either one. The shared read behind the
 * downgrade-selection screen and the paywall, so the two can never disagree.
 */
export async function getSelectionStatus(): Promise<core.SelectionStatus> {
  const user = await requireUser();
  return core.getSelectionStatus(user.id);
}

/**
 * Commit the list half of the downgrade selection: keep exactly `listIds`
 * active, lock every other list the user owns.
 *
 * Re-validated in core against the real cap and real ownership, so a tampered
 * client that posts ten ids gets a refusal rather than ten active lists.
 */
export async function selectActiveLists(
  listIds: string[],
): Promise<SelectionCommitResult> {
  const user = await requireUser();

  let result: core.SelectionResult;
  try {
    result = await core.selectActiveLists(user.id, listIds);
  } catch (e) {
    unstable_rethrow(e);
    return toFailure(e);
  }

  revalidatePath("/");
  revalidatePath("/downgrade");

  return { ok: true, ...result, nextStep: stepFor(await core.getSelectionStatus(user.id)) };
}

/**
 * Commit the bookmark half: keep exactly `bookmarkIds` active, lock every other
 * bookmark inside the user's still-active lists.
 *
 * Core rejects an id from a locked list outright, so {@link selectActiveLists}
 * has to have run first whenever the account was also over the list cap.
 */
export async function selectActiveBookmarks(
  bookmarkIds: string[],
): Promise<SelectionCommitResult> {
  const user = await requireUser();

  let result: core.SelectionResult;
  try {
    result = await core.selectActiveBookmarks(user.id, bookmarkIds);
  } catch (e) {
    unstable_rethrow(e);
    return toFailure(e);
  }

  revalidatePath("/");
  revalidatePath("/downgrade");

  return { ok: true, ...result, nextStep: stepFor(await core.getSelectionStatus(user.id)) };
}

/**
 * Begin a RevenueCat Web Billing checkout for the signed-in user and hand back
 * the hosted URL to send them to, or a reason it could not start.
 *
 * The App User ID is the session's `User.id`, resolved server-side (see
 * `lib/checkout.ts`). Client islands that would rather navigate than call this
 * can link straight to `/api/checkout?plan=…`, which runs the same helper.
 */
export async function startWebCheckout(plan: PlanId): Promise<CheckoutSession> {
  return createWebCheckoutSession(plan);
}
