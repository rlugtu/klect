"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, CopyPlus, FolderInput, Trash2, X } from "lucide-react";
import {
  runCopyBookmarks,
  runDeleteBookmarks,
  runMoveBookmarks,
  runSetVisited,
} from "@/lib/bookmark-mutations";
import { MoveToListMenu, Popover, type MoveDestination } from "./MoveToListMenu";
import type { BookmarkSelection } from "./useBookmarkSelection";

/**
 * Sticky bulk action bar for a bookmark grid (lg+ only): count, Move to list,
 * Copy to list, Mark visited (or unvisited), Delete, Clear. Rendered as the last child of the grid's column, so it sticks
 * to the bottom of the viewport while that column scrolls.
 *
 * Only offers an action when it is valid for every selected item: Move needs
 * each one movable (collaborator+, not locked), and so do Copy and Mark
 * visited (the server refuses locked rows for both), Delete needs each one
 * deletable (collaborator+). When a mixed selection rules an action out, the
 * button is disabled with a reason instead of acting on a subset. No "Add
 * tag": there is no single-item add-tag mutation to build it on yet.
 */
export function BookmarkBulkBar({
  selection,
  destinations,
}: {
  selection: BookmarkSelection;
  destinations: MoveDestination[];
}) {
  const router = useRouter();
  const [menu, setMenu] = useState<"move" | "copy" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);
  const moveBtn = useRef<HTMLButtonElement>(null);
  const copyBtn = useRef<HTMLButtonElement>(null);
  const deleteBtn = useRef<HTMLButtonElement>(null);
  const items = selection.selectedItems;
  const n = items.length;

  const canMove = n > 0 && items.every((i) => i.canMove);
  const canDelete = n > 0 && items.every((i) => i.canDelete);
  const sourceIds = [...new Set(items.map((i) => i.listId))];
  // Hide a destination only when every selected bookmark already lives there.
  const exclude = sourceIds.length === 1 ? sourceIds : [];
  const ids = items.map((i) => i.id);
  // Offer the opposite of the selection's state: unvisited only when every
  // selected bookmark is already visited.
  const markVisited = !(n > 0 && items.every((i) => i.visited));
  const lockedReason = "Some selected bookmarks are locked or view-only";

  const btn =
    "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-current/30 px-3 text-sm disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="pointer-events-none sticky bottom-4 z-30 hidden justify-center lg:flex">
      {/* Always mounted, so the live region announces the count as it changes. */}
      <p className="sr-only" aria-live="polite">
        {n > 0 ? `${n} selected` : ""}
      </p>
      {n > 0 && (
        <div
          role="toolbar"
          aria-label="Bulk actions"
          className="pixel-box bg-ink text-bg pointer-events-auto flex items-center gap-2 py-2 pr-2 pl-4 shadow-lg"
        >
          <span className="mr-1 text-sm font-semibold">{n} selected</span>

          <span className="relative">
            <button
              ref={moveBtn}
              type="button"
              className={btn}
              disabled={!canMove}
              title={canMove ? "Move to list" : "Some selected bookmarks can't be moved (locked or view-only)"}
              aria-haspopup="menu"
              aria-expanded={menu === "move"}
              onClick={() => setMenu((m) => (m === "move" ? null : "move"))}
            >
              <FolderInput size={14} aria-hidden /> Move to list
            </button>
            {menu === "move" && (
              <MoveToListMenu
                destinations={destinations}
                excludeListIds={exclude}
                count={n}
                align="left"
                placement="above"
                onClose={() => setMenu(null)}
                returnFocus={() => moveBtn.current}
                onPick={(dest) => {
                  setMenu(null);
                  void runMoveBookmarks(ids, dest, router);
                }}
              />
            )}
          </span>

          <span className="relative">
            <button
              ref={copyBtn}
              type="button"
              className={btn}
              disabled={!canMove}
              title={canMove ? "Copy to list (the originals stay here)" : lockedReason}
              aria-haspopup="menu"
              aria-expanded={menu === "copy"}
              onClick={() => setMenu((m) => (m === "copy" ? null : "copy"))}
            >
              <CopyPlus size={14} aria-hidden /> Copy to list
            </button>
            {menu === "copy" && (
              <MoveToListMenu
                verb="Copy"
                destinations={destinations}
                excludeListIds={exclude}
                count={n}
                align="left"
                placement="above"
                onClose={() => setMenu(null)}
                returnFocus={() => copyBtn.current}
                onPick={async (dest) => {
                  setMenu(null);
                  if (await runCopyBookmarks(ids, dest, router)) selection.clear();
                }}
              />
            )}
          </span>

          <button
            type="button"
            className={btn}
            disabled={!canMove || busy}
            title={canMove ? undefined : lockedReason}
            onClick={async () => {
              setBusy(true);
              await runSetVisited(ids, markVisited, router);
              setBusy(false);
            }}
          >
            <CircleCheck size={14} aria-hidden />
            {markVisited ? "Mark visited" : "Mark unvisited"}
          </button>

          <span className="relative">
            <button
              ref={deleteBtn}
              type="button"
              className={`${btn} hover:bg-danger hover:border-danger`}
              disabled={!canDelete}
              title={canDelete ? "Delete" : "Some selected bookmarks are view-only"}
              aria-haspopup="menu"
              aria-expanded={menu === "delete"}
              onClick={() => setMenu((m) => (m === "delete" ? null : "delete"))}
            >
              <Trash2 size={14} aria-hidden /> Delete
            </button>
            {menu === "delete" && (
              <Popover
                label="Confirm delete"
                align="left"
                placement="above"
                onClose={() => setMenu(null)}
                returnFocus={() => deleteBtn.current}
              >
                <p className="px-2 pt-1 pb-2">
                  Delete {n} bookmark{n === 1 ? "" : "s"}? Comments go with them.
                </p>
                <div className="flex gap-3 px-2 pb-1">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenu(null);
                      void runDeleteBookmarks(ids, router);
                    }}
                    className="text-danger cursor-pointer font-bold hover:underline"
                  >
                    Delete {n}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenu(null);
                      deleteBtn.current?.focus();
                    }}
                    className="text-muted cursor-pointer hover:underline"
                  >
                    Cancel
                  </button>
                </div>
              </Popover>
            )}
          </span>

          <button
            type="button"
            className={btn}
            onClick={selection.clear}
            title="Clear selection (Esc)"
          >
            <X size={14} aria-hidden /> Clear
          </button>
        </div>
      )}
    </div>
  );
}
