"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { requireUser } from "@/lib/session";
import { setFlashToast } from "@/lib/toast-flash";
import * as core from "@/lib/core/bookmarks";
import {
  isFreeLimitError,
  toFreeLimitResult,
  type CappedCreateResult,
  type FreeLimitResult,
} from "@/lib/core/entitlements";
import { isLockedError } from "@/lib/core/lists";

/** Extract a bookmark's fields + tags from submitted FormData. */
function bookmarkInputFromFormData(formData: FormData): core.BookmarkInput {
  // Coordinates are present only when the location was picked from autocomplete;
  // free-typed text (or old rows) leaves them null.
  const toCoord = (v: FormDataEntryValue | null): number | null => {
    const s = v === null ? "" : String(v).trim();
    return s !== "" && Number.isFinite(Number(s)) ? Number(s) : null;
  };

  return {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    urls: String(formData.get("urls") ?? "").split(/\r?\n/),
    images: formData.getAll("images").map((u) => String(u)),
    notes: String(formData.get("notes") ?? ""),
    location: String(formData.get("location") ?? ""),
    latitude: toCoord(formData.get("latitude")),
    longitude: toCoord(formData.get("longitude")),
    rating: Number(formData.get("rating") ?? 0),
    visited: formData.get("visited") === "on",
    videoUrl: String(formData.get("videoUrl") ?? ""),
    videoType: String(formData.get("videoType") ?? ""),
    tagNames: formData.getAll("tags").map((t) => String(t)),
  };
}

/**
 * Returns a {@link CappedCreateResult}: `undefined` once saved, or the
 * structured refusal when the free bookmark cap is hit, so the caller can show
 * the paywall instead of Next's generic error boundary.
 */
export async function createBookmark(
  listId: string,
  formData: FormData,
): Promise<CappedCreateResult> {
  const user = await requireUser();

  // Guards the core call only. `unstable_rethrow` is first in the catch so any
  // Next control-flow signal (redirect, notFound, dynamic-rendering bailout)
  // thrown from inside is re-thrown rather than mistaken for a failure.
  try {
    await core.createBookmark(user.id, listId, bookmarkInputFromFormData(formData));
  } catch (e) {
    unstable_rethrow(e);
    if (isFreeLimitError(e)) return toFreeLimitResult(e);
    throw e;
  }

  // Stay on the list so the create panel can close and the new card appears.
  revalidatePath(`/lists/${listId}`);
}

/**
 * Returns a {@link CappedCreateResult}: `undefined` once saved, or the
 * structured refusal when the free bookmark or list cap is hit — this flow can
 * create lists too, so either cap can stop it.
 */
export async function createBookmarkInLists(
  existingListIds: string[],
  newListNames: string[],
  formData: FormData,
): Promise<CappedCreateResult> {
  const user = await requireUser();

  // Guards the core call only; see the note in `createBookmark` on the rethrow.
  let targetIds: string[];
  try {
    ({ targetIds } = await core.createBookmarkInLists(
      user.id,
      existingListIds,
      newListNames,
      bookmarkInputFromFormData(formData),
      formData.get("newListsPublic") === "on",
    ));
  } catch (e) {
    unstable_rethrow(e);
    if (isFreeLimitError(e)) return toFreeLimitResult(e);
    throw e;
  }

  revalidatePath("/");
  for (const listId of targetIds) revalidatePath(`/lists/${listId}`);
}

export async function updateBookmark(bookmarkId: string, formData: FormData) {
  const user = await requireUser();
  const { listId } = await core.updateBookmark(
    user.id,
    bookmarkId,
    bookmarkInputFromFormData(formData),
  );

  revalidatePath(`/lists/${listId}`);
  revalidatePath(`/lists/${listId}/bookmarks/${bookmarkId}`);
}

export async function deleteBookmark(bookmarkId: string) {
  const user = await requireUser();
  const { listId } = await core.deleteBookmark(user.id, bookmarkId);

  revalidatePath(`/lists/${listId}`);
  await setFlashToast("success", "Bookmark deleted");
  redirect(`/lists/${listId}`);
}

/** Quick toggle of the visited flag from a card/detail. */
export async function toggleVisited(bookmarkId: string) {
  const user = await requireUser();
  const { listId } = await core.toggleVisited(user.id, bookmarkId);

  revalidatePath(`/lists/${listId}`);
  revalidatePath(`/lists/${listId}/bookmarks/${bookmarkId}`);
}

/** Quick inline set of the 0–5 rating from the detail view. */
export async function setRating(bookmarkId: string, rating: number) {
  const user = await requireUser();
  const { listId } = await core.setRating(user.id, bookmarkId, rating);

  revalidatePath(`/lists/${listId}`);
  revalidatePath(`/lists/${listId}/bookmarks/${bookmarkId}`);
}

/**
 * What the bulk bookmark actions return. Never throws for an expected refusal
 * (no permission, locked, cap, not found): a thrown server-action error reaches
 * the browser with its message stripped in production, and the bulk UI needs
 * the real reason for its toast. `FreeLimitResult` carries the upgrade path.
 */
export type BulkBookmarkResult =
  | {
      ok: true;
      count: number;
      skipped: number;
      /** Moves only: moved ids grouped by the list they came from (for undo). */
      bySource?: Record<string, string[]>;
    }
  | { ok: false; code?: undefined; error: string }
  | FreeLimitResult;

/** Expected refusals carry their own copy; anything else gets a generic line. */
function bulkFailure(e: unknown, scope: string, fallback: string): BulkBookmarkResult {
  if (isFreeLimitError(e)) return toFreeLimitResult(e);
  if (isLockedError(e) || (e instanceof Error && e.constructor === Error)) {
    return { ok: false, error: e.message };
  }
  console.error(`[${scope}]`, e);
  return { ok: false, error: fallback };
}

/**
 * Move bookmarks into another list (re-parent, not copy). Used by the desktop
 * "Move to list" menu, the bulk bar, and drag onto a sidebar list. Revalidates
 * the whole app layout: the source and target lists, the sidebar counts, home,
 * and All bookmarks all change.
 */
export async function moveBookmarks(
  bookmarkIds: string[],
  listId: string,
): Promise<BulkBookmarkResult> {
  const user = await requireUser();
  let result: Awaited<ReturnType<typeof core.moveBookmarks>>;
  try {
    result = await core.moveBookmarks(user.id, bookmarkIds, listId);
  } catch (e) {
    unstable_rethrow(e);
    return bulkFailure(e, "bookmarks.move", "Couldn't move those bookmarks.");
  }

  revalidatePath("/", "layout");
  return {
    ok: true,
    count: result.moved,
    skipped: result.skipped,
    bySource: result.bySource,
  };
}

/**
 * Copy bookmarks into another list as independent copies (desktop "Copy to
 * list"). Same result shape as a move; the copies are written by the
 * `/bookmarks/new` multi-list path (see `core.copyBookmarksToList`).
 */
export async function copyBookmarks(
  bookmarkIds: string[],
  listId: string,
): Promise<BulkBookmarkResult> {
  const user = await requireUser();
  let copied: number;
  try {
    ({ copied } = await core.copyBookmarksToList(user.id, bookmarkIds, listId));
  } catch (e) {
    unstable_rethrow(e);
    return bulkFailure(e, "bookmarks.copy", "Couldn't copy those bookmarks.");
  }

  revalidatePath("/", "layout");
  return { ok: true, count: copied, skipped: 0 };
}

/** Mark several bookmarks visited or unvisited (desktop bulk bar). */
export async function setBookmarksVisited(
  bookmarkIds: string[],
  visited: boolean,
): Promise<BulkBookmarkResult> {
  const user = await requireUser();
  let updated: number;
  try {
    ({ updated } = await core.setVisitedMany(user.id, bookmarkIds, visited === true));
  } catch (e) {
    unstable_rethrow(e);
    return bulkFailure(e, "bookmarks.setVisitedMany", "Couldn't update those bookmarks.");
  }

  revalidatePath("/", "layout");
  return { ok: true, count: updated, skipped: 0 };
}

/** Delete several bookmarks at once (desktop bulk bar). Stays on the page. */
export async function deleteBookmarks(bookmarkIds: string[]): Promise<BulkBookmarkResult> {
  const user = await requireUser();
  let deleted: number;
  try {
    ({ deleted } = await core.deleteBookmarks(user.id, bookmarkIds));
  } catch (e) {
    unstable_rethrow(e);
    return bulkFailure(e, "bookmarks.deleteMany", "Couldn't delete those bookmarks.");
  }

  revalidatePath("/", "layout");
  return { ok: true, count: deleted, skipped: 0 };
}
