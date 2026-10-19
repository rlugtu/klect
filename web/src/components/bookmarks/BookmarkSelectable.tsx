"use client";

import { useRef, useState, type DragEvent, type MouseEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CopyPlus, ExternalLink, FolderInput, Link2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { isDesktopViewport } from "@/lib/client-prefs";
import { toast } from "@/lib/toast";
import {
  BOOKMARK_DRAG_SOURCE_PREFIX,
  BOOKMARK_DRAG_TYPE,
} from "@/lib/bookmark-dnd";
import {
  runCopyBookmarks,
  runDeleteBookmarks,
  runMoveBookmarks,
} from "@/lib/bookmark-mutations";
import { MoveToListMenu, Popover, type MoveDestination } from "./MoveToListMenu";
import type { BookmarkSelection, SelectableItem } from "./useBookmarkSelection";

/**
 * Desktop (lg+) wrapper around one bookmark card or compact row: a selection
 * checkbox (top-left), hover actions (top-right: open link, copy link, move to
 * list, copy to list, delete), modified-click selection, and dragging the card (or the
 * selected group) onto a list in the sidebar.
 *
 * The card itself stays a plain link and these controls are siblings layered
 * over it, never nested inside the anchor. Every control is hidden below lg;
 * at lg+ they show on hover or keyboard focus within the card, always while a
 * selection exists, and always on coarse pointers (a touch iPad has no hover).
 *
 * Mutation controls follow `item`: viewers get no checkbox, move, or delete;
 * a locked card can be selected and deleted but not moved.
 */
export function BookmarkSelectable({
  item,
  selection,
  destinations,
  variant,
  labelled = false,
  children,
}: {
  item: SelectableItem;
  selection: BookmarkSelection;
  destinations: MoveDestination[];
  variant: "card" | "row";
  /** The card shows an "in <list>" line on top; overlays sit below it. */
  labelled?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const [menu, setMenu] = useState<"move" | "copy" | "delete" | null>(null);
  const moveBtn = useRef<HTMLButtonElement>(null);
  const copyBtn = useRef<HTMLButtonElement>(null);
  const deleteBtn = useRef<HTMLButtonElement>(null);

  const selectable = item.canMove || item.canDelete;
  const selected = selection.isSelected(item.id);
  const pending = selection.isPending(item.id);
  const inSelectionMode = selection.selected.length > 0;
  if (selection.isHidden(item.id)) return null;

  // Cmd/Ctrl-click toggles, Shift-click extends, at lg+ only. Captured before
  // the card link sees the click, so no new tab or window opens. Clicks on the
  // overlay controls are left alone.
  function onClickCapture(e: MouseEvent<HTMLDivElement>) {
    if (!selectable || !isDesktopViewport()) return;
    if (!(e.metaKey || e.ctrlKey || e.shiftKey) || e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-card-overlay]")) return;
    e.preventDefault();
    e.stopPropagation();
    selection.pick(item.id, e.shiftKey);
  }

  function onDragStart(e: DragEvent<HTMLDivElement>) {
    if (!item.canMove || !isDesktopViewport()) return;
    const ids = selection.dragIds(item.id);
    if (ids.length === 0) return;
    e.dataTransfer.setData(BOOKMARK_DRAG_TYPE, JSON.stringify({ ids }));
    // Single-source drags name their list, so that list's sidebar row can
    // decline the drop during dragover (see isDragFromList).
    if (!selected || ids.length === 1 || selection.selectedItems.every((i) => i.listId === item.listId)) {
      e.dataTransfer.setData(`${BOOKMARK_DRAG_SOURCE_PREFIX}${item.listId}`.toLowerCase(), "");
    }
    e.dataTransfer.effectAllowed = "move";
    if (ids.length > 1) setCountDragImage(e.dataTransfer, ids.length);
    selection.setDragging(ids);
  }

  async function copyLink() {
    const href = `${window.location.origin}/lists/${item.listId}/bookmarks/${item.id}`;
    try {
      await navigator.clipboard.writeText(href);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy the link.");
    }
  }

  const revealBase =
    "opacity-0 transition-opacity group-hover/sel:opacity-100 group-focus-within/sel:opacity-100 pointer-coarse:opacity-100";
  // Checkboxes stay up for the whole selection; actions only for the card in hand.
  const revealCheck = cn(revealBase, inSelectionMode && "opacity-100");
  const revealActions = cn(revealBase, menu && "opacity-100");
  const iconBtn =
    "pixel-box-sm bg-panel text-ink hover:text-primary inline-flex size-8 cursor-pointer items-center justify-center";

  return (
    <div
      className={cn(
        "group/sel relative min-w-0",
        pending && "pointer-events-none opacity-40",
        selection.isDragging(item.id) && "opacity-50",
        selected && variant === "card" && "[&>a]:outline-primary [&>a]:outline-2 [&>a]:outline-offset-2",
        selected && variant === "row" && "[&>a]:bg-primary/10",
      )}
      data-selected={selected || undefined}
      draggable={item.canMove || undefined}
      onClickCapture={onClickCapture}
      onDragStart={onDragStart}
      onDragEnd={() => selection.setDragging([])}
    >
      {children}

      {selectable && (
        <label
          data-card-overlay
          className={cn(
            "absolute z-10 hidden cursor-pointer items-center justify-center lg:flex",
            "pixel-box-sm bg-panel size-7",
            variant === "card"
              ? cn(labelled ? "top-11" : "top-2", "left-2")
              : "top-1/2 left-1 -translate-y-1/2",
            revealCheck,
          )}
          title="Select (Shift-click for a range)"
        >
          <input
            type="checkbox"
            checked={selected}
            onChange={() => {}}
            onClick={(e) => selection.pick(item.id, e.shiftKey)}
            aria-label={`Select ${item.name}`}
            className="accent-primary size-4 cursor-pointer"
          />
        </label>
      )}

      <div
        data-card-overlay
        className={cn(
          "absolute z-10 hidden items-center gap-1 lg:flex",
          variant === "card"
            ? cn(labelled ? "top-11" : "top-2", "right-2")
            : "top-1/2 right-2 -translate-y-1/2",
          revealActions,
        )}
      >
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className={iconBtn}
            title="Open link"
            aria-label={`Open link for ${item.name}`}
          >
            <ExternalLink size={14} aria-hidden />
          </a>
        )}
        <button
          type="button"
          className={iconBtn}
          onClick={copyLink}
          title="Copy link to this bookmark"
          aria-label={`Copy link to ${item.name}`}
        >
          <Link2 size={14} aria-hidden />
        </button>
        {item.canMove && (
          <span className="relative">
            <button
              ref={moveBtn}
              type="button"
              className={iconBtn}
              aria-haspopup="menu"
              aria-expanded={menu === "move"}
              onClick={() => setMenu((m) => (m === "move" ? null : "move"))}
              title="Move to list"
              aria-label={`Move ${item.name} to list`}
            >
              <FolderInput size={14} aria-hidden />
            </button>
            {menu === "move" && (
              <MoveToListMenu
                destinations={destinations}
                excludeListIds={[item.listId]}
                count={1}
                onClose={() => setMenu(null)}
                returnFocus={() => moveBtn.current}
                onPick={(dest) => {
                  setMenu(null);
                  void runMoveBookmarks([item.id], dest, router);
                }}
              />
            )}
          </span>
        )}
        {item.canMove && (
          <span className="relative">
            <button
              ref={copyBtn}
              type="button"
              className={iconBtn}
              aria-haspopup="menu"
              aria-expanded={menu === "copy"}
              onClick={() => setMenu((m) => (m === "copy" ? null : "copy"))}
              title="Copy to list"
              aria-label={`Copy ${item.name} to list`}
            >
              <CopyPlus size={14} aria-hidden />
            </button>
            {menu === "copy" && (
              <MoveToListMenu
                verb="Copy"
                destinations={destinations}
                excludeListIds={[item.listId]}
                count={1}
                onClose={() => setMenu(null)}
                returnFocus={() => copyBtn.current}
                onPick={(dest) => {
                  setMenu(null);
                  void runCopyBookmarks([item.id], dest, router);
                }}
              />
            )}
          </span>
        )}
        {item.canDelete && (
          <span className="relative">
            <button
              ref={deleteBtn}
              type="button"
              className={cn(iconBtn, "hover:text-danger")}
              aria-haspopup="menu"
              aria-expanded={menu === "delete"}
              onClick={() => setMenu((m) => (m === "delete" ? null : "delete"))}
              title="Delete"
              aria-label={`Delete ${item.name}`}
            >
              <Trash2 size={14} aria-hidden />
            </button>
            {menu === "delete" && (
              <Popover
                label="Confirm delete"
                onClose={() => setMenu(null)}
                returnFocus={() => deleteBtn.current}
              >
                <p className="px-2 pt-1 pb-2">Delete this bookmark? Its comments go with it.</p>
                <div className="flex gap-2 px-2 pb-1">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenu(null);
                      void runDeleteBookmarks([item.id], router);
                    }}
                    className="text-danger cursor-pointer font-bold hover:underline"
                  >
                    Delete
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
        )}
      </div>
    </div>
  );
}

/** A "3 bookmarks" chip as the drag image, so a group drag reads as a group. */
function setCountDragImage(dt: DataTransfer, n: number) {
  const el = document.createElement("div");
  el.textContent = `${n} bookmarks`;
  el.className = "pixel-box-sm bg-primary text-primary-ink";
  Object.assign(el.style, {
    position: "fixed",
    top: "-1000px",
    left: "-1000px",
    padding: "6px 12px",
    font: "600 14px system-ui, sans-serif",
  });
  document.body.appendChild(el);
  dt.setDragImage(el, 16, 16);
  setTimeout(() => el.remove(), 0);
}
