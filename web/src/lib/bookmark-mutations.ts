"use client";

import {
  copyBookmarks,
  deleteBookmarks,
  moveBookmarks,
  setBookmarksVisited,
  type BulkBookmarkResult,
} from "@/lib/actions/bookmarks";
import { emitBookmarkMutation } from "@/lib/bookmark-dnd";
import { showFreeLimitToast, upgradeHref } from "@/lib/free-limit";
import { toast } from "@/lib/toast";
import type { FreeLimitResult } from "@/lib/core/entitlements";

/**
 * The one client path for desktop move and bulk delete, shared by the card
 * menu, the bulk bar, and drops on the sidebar, so they toast and announce the
 * same way. Each call emits `start` (grids dim the cards), then `done` or
 * `failed` (grids hide or restore them), then refreshes the route so the
 * server's version replaces the optimistic one. A successful move's toast
 * offers Undo, which moves each bookmark back to the list it came from.
 */

type Nav = { push: (href: string) => void; refresh: () => void };

const plural = (n: number) => `${n} bookmark${n === 1 ? "" : "s"}`;

function isFreeLimit(r: BulkBookmarkResult): r is FreeLimitResult {
  return !r.ok && r.code === "FREE_LIMIT";
}

async function call(run: () => Promise<BulkBookmarkResult>): Promise<BulkBookmarkResult> {
  try {
    return await run();
  } catch {
    // Network failure or an unexpected server error (its message is not safe
    // to show, and in production it is stripped anyway).
    return { ok: false, error: "Something went wrong. Try again." };
  }
}

function reportFailure(r: BulkBookmarkResult, nav: Nav) {
  if (r.ok) return;
  if (isFreeLimit(r)) showFreeLimitToast(r, () => nav.push(upgradeHref(r)));
  else toast.error(r.error);
}

export async function runMoveBookmarks(
  ids: string[],
  target: { id: string; name: string },
  nav: Nav,
): Promise<boolean> {
  if (ids.length === 0) return false;
  emitBookmarkMutation({ phase: "start", kind: "move", ids, targetListId: target.id });
  const r = await call(() => moveBookmarks(ids, target.id));
  if (!r.ok) {
    emitBookmarkMutation({ phase: "failed", kind: "move", ids, targetListId: target.id });
    reportFailure(r, nav);
    return false;
  }
  emitBookmarkMutation({ phase: "done", kind: "move", ids, targetListId: target.id });
  if (r.count === 0) toast.info(`Already in ${target.name}`);
  else {
    const bySource = r.bySource;
    toast.success(`Moved ${plural(r.count)} to ${target.name}`, {
      duration: UNDO_TOAST_DURATION,
      action:
        bySource && Object.keys(bySource).length > 0
          ? { label: "Undo", onClick: () => void undoMove(bySource, nav) }
          : undefined,
    });
  }
  nav.refresh();
  return true;
}

/** Long enough to read the toast and reach Undo (it pauses on hover too). */
const UNDO_TOAST_DURATION = 8000;

/**
 * Undo a move: send each group back to the list it came from, through the same
 * `moveBookmarks` action (so every rule applies again: COLLABORATOR on both
 * lists, no locked list or bookmark, and the free cap when a group returns to a
 * list the viewer owns from someone else's). One call per source list, each
 * its own transaction; it stops at the first refusal and says why. Poll
 * options the move dropped are not restored.
 */
async function undoMove(bySource: Record<string, string[]>, nav: Nav) {
  let restored = 0;
  for (const [listId, ids] of Object.entries(bySource)) {
    emitBookmarkMutation({ phase: "start", kind: "move", ids, targetListId: listId });
    const r = await call(() => moveBookmarks(ids, listId));
    if (!r.ok) {
      emitBookmarkMutation({ phase: "failed", kind: "move", ids, targetListId: listId });
      if (restored > 0) nav.refresh();
      if (isFreeLimit(r)) {
        showFreeLimitToast(r, () => nav.push(upgradeHref(r)));
      } else {
        const done = restored > 0 ? `Moved ${plural(restored)} back, then stopped. ` : "";
        toast.error(`${done}Couldn't undo: ${r.error}`);
      }
      return;
    }
    emitBookmarkMutation({ phase: "done", kind: "move", ids, targetListId: listId });
    restored += r.count;
  }
  toast.success(`Moved ${plural(restored)} back`);
  nav.refresh();
}

/**
 * Copy to list: independent copies in the target (see `core.copyBookmarksToList`).
 * Nothing leaves the grid, so there are no mutation events; the toast links to
 * the target list. Returns whether it worked, so the bulk bar can clear.
 */
export async function runCopyBookmarks(
  ids: string[],
  target: { id: string; name: string },
  nav: Nav,
): Promise<boolean> {
  if (ids.length === 0) return false;
  const r = await call(() => copyBookmarks(ids, target.id));
  if (!r.ok) {
    reportFailure(r, nav);
    return false;
  }
  toast.success(`Copied ${plural(r.count)} to ${target.name}`, {
    action: { label: "Open", onClick: () => nav.push(`/lists/${target.id}`) },
  });
  nav.refresh();
  return true;
}

/** Bulk Mark visited / Mark unvisited from the bulk bar. */
export async function runSetVisited(
  ids: string[],
  visited: boolean,
  nav: Nav,
): Promise<boolean> {
  if (ids.length === 0) return false;
  const r = await call(() => setBookmarksVisited(ids, visited));
  if (!r.ok) {
    reportFailure(r, nav);
    return false;
  }
  toast.success(`Marked ${plural(r.count)} ${visited ? "visited" : "unvisited"}`);
  nav.refresh();
  return true;
}

export async function runDeleteBookmarks(ids: string[], nav: Nav): Promise<boolean> {
  if (ids.length === 0) return false;
  emitBookmarkMutation({ phase: "start", kind: "delete", ids });
  const r = await call(() => deleteBookmarks(ids));
  if (!r.ok) {
    emitBookmarkMutation({ phase: "failed", kind: "delete", ids });
    reportFailure(r, nav);
    return false;
  }
  emitBookmarkMutation({ phase: "done", kind: "delete", ids });
  toast.success(`Deleted ${plural(r.count)}`);
  nav.refresh();
  return true;
}
