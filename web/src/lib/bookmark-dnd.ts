"use client";

import { useEffect, useRef } from "react";

/**
 * Client glue for the desktop bookmark move/delete interactions: the drag and
 * drop payload format, and a tiny window event that lets the place a mutation
 * starts (bulk bar, card menu, a sidebar drop) tell every bookmark grid on the
 * page what is happening, so the grid can dim, hide, or deselect the affected
 * cards right away instead of waiting for the server refresh.
 */

/** Drag data type for bookmarks. Its value is a JSON {@link BookmarkDragPayload}. */
export const BOOKMARK_DRAG_TYPE = "application/x-klect-bookmarks";

/**
 * Extra, empty drag type naming the single list every dragged bookmark comes
 * from. Drop targets cannot read drag data until the drop, but they can see the
 * type names during dragover, which is how a sidebar row knows not to light up
 * as a target for the list the drag started in. Absent when the drag spans
 * several lists (All bookmarks).
 */
export const BOOKMARK_DRAG_SOURCE_PREFIX = "application/x-klect-from-";

/** Drag data type for reordering sidebar lists. */
export const LIST_DRAG_TYPE = "application/x-klect-list";

export type BookmarkDragPayload = { ids: string[] };

export function readBookmarkDrag(dt: DataTransfer): BookmarkDragPayload | null {
  try {
    const raw = dt.getData(BOOKMARK_DRAG_TYPE);
    if (!raw) return null;
    const v = JSON.parse(raw) as BookmarkDragPayload;
    return Array.isArray(v?.ids) && v.ids.every((id) => typeof id === "string")
      ? { ids: v.ids }
      : null;
  } catch {
    return null;
  }
}

/** True when a drag carries bookmarks (readable during dragover). */
export function isBookmarkDrag(dt: DataTransfer): boolean {
  return Array.from(dt.types).includes(BOOKMARK_DRAG_TYPE);
}

/** True when a bookmark drag started in `listId` only (dropping there is a no-op). */
export function isDragFromList(dt: DataTransfer, listId: string): boolean {
  return Array.from(dt.types).includes(`${BOOKMARK_DRAG_SOURCE_PREFIX}${listId}`.toLowerCase());
}

export type BookmarkMutationEvent = {
  phase: "start" | "done" | "failed";
  kind: "move" | "delete";
  ids: string[];
  /** For moves: where the bookmarks went. */
  targetListId?: string;
};

const EVENT = "klect:bookmark-mutation";

export function emitBookmarkMutation(detail: BookmarkMutationEvent) {
  window.dispatchEvent(new CustomEvent<BookmarkMutationEvent>(EVENT, { detail }));
}

/** Subscribe to bookmark mutation events for the component's lifetime. */
export function useBookmarkMutationEvents(handler: (e: BookmarkMutationEvent) => void) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    function on(e: Event) {
      ref.current((e as CustomEvent<BookmarkMutationEvent>).detail);
    }
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
}
