"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isDesktopViewport, isTypingTarget } from "@/lib/client-prefs";
import { selectRange, toggleId, visibleSelection } from "@/lib/multi-select";
import { useBookmarkMutationEvents } from "@/lib/bookmark-dnd";

/** What the selection UI needs to know about one card. */
export type SelectableItem = {
  id: string;
  name: string;
  listId: string;
  url: string | null;
  /**
   * COLLABORATOR+ and neither the bookmark nor its list is locked. Also gates
   * Copy to list and Mark visited (both refuse locked rows on the server).
   */
  canMove: boolean;
  /** Current visited flag, so the bulk bar can offer the opposite. */
  visited?: boolean;
  /** COLLABORATOR+ (deleting stays allowed on locked rows). */
  canDelete: boolean;
};

/**
 * Desktop multi-select state for one bookmark grid.
 *
 * - `order` is the on-screen order (after filter and sort); selection is always
 *   reported narrowed to it, so a card hidden by a filter is never acted on.
 * - Shift extends from the last plain toggle (the anchor); Cmd/Ctrl toggles.
 * - Esc clears and Cmd/Ctrl+A selects everything selectable, both only while a
 *   selection exists, never while typing or with a dialog open, and Esc yields
 *   to an open bookmark panel (`escapeYields`) so one press does one thing.
 * - Listens to bookmark mutation events: cards being moved or deleted dim
 *   (`pending`), and once done they leave the selection, and are hidden when
 *   they no longer belong here (`hideMovedOutOf`: the list this grid shows;
 *   omit it where a moved card stays visible, as in All bookmarks). Cards
 *   moved back into that list (Undo) are shown again.
 */
export function useBookmarkSelection({
  items,
  order,
  enabled,
  escapeYields,
  hideMovedOutOf,
}: {
  items: SelectableItem[];
  order: string[];
  enabled: boolean;
  escapeYields?: () => boolean;
  hideMovedOutOf?: string;
}) {
  const [raw, setRaw] = useState<string[]>([]);
  const [pending, setPending] = useState<string[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [dragging, setDragging] = useState<string[]>([]);
  const anchor = useRef<string | null>(null);

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const selectableOrder = useMemo(
    () =>
      order.filter((id) => {
        const it = byId.get(id);
        return it && (it.canMove || it.canDelete) && !hidden.includes(id);
      }),
    [order, byId, hidden],
  );
  const selected = useMemo(
    () => (enabled ? visibleSelection(raw, selectableOrder) : []),
    [enabled, raw, selectableOrder],
  );
  const selectedItems = useMemo(
    () => selected.map((id) => byId.get(id)!).filter(Boolean),
    [selected, byId],
  );

  const toggle = useCallback((id: string) => {
    anchor.current = id;
    setRaw((s) => toggleId(s, id));
  }, []);
  const extend = useCallback(
    (id: string) => {
      setRaw((s) => selectRange(s, selectableOrder, anchor.current, id));
      anchor.current ??= id;
    },
    [selectableOrder],
  );
  const clear = useCallback(() => {
    anchor.current = null;
    setRaw([]);
  }, []);

  /** A checkbox or modified card click: shift extends, anything else toggles. */
  const pick = useCallback(
    (id: string, shift: boolean) => (shift ? extend(id) : toggle(id)),
    [extend, toggle],
  );

  useBookmarkMutationEvents((e) => {
    setDragging([]);
    if (e.phase === "start") {
      setPending((p) => [...new Set([...p, ...e.ids])]);
      return;
    }
    setPending((p) => p.filter((id) => !e.ids.includes(id)));
    if (e.phase !== "done") return;
    setRaw((s) => s.filter((id) => !e.ids.includes(id)));
    const gone =
      e.kind === "delete" ||
      (hideMovedOutOf !== undefined && e.targetListId !== hideMovedOutOf);
    if (gone) setHidden((h) => [...new Set([...h, ...e.ids])]);
    // An undo moves cards back here: show them again (the refresh that
    // follows brings their server rows).
    else if (e.kind === "move" && e.targetListId === hideMovedOutOf) {
      setHidden((h) => h.filter((id) => !e.ids.includes(id)));
    }
  });

  const hasSelection = selected.length > 0;
  useEffect(() => {
    if (!enabled || !hasSelection) return;
    function onKey(e: KeyboardEvent) {
      // A focused checkbox (this grid's own) is not typing; text fields are.
      const t = e.target as HTMLInputElement | null;
      const checkbox = t?.tagName === "INPUT" && t.type === "checkbox";
      if (e.defaultPrevented || !isDesktopViewport()) return;
      if (!checkbox && isTypingTarget(e.target)) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key === "Escape" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (escapeYields?.()) return;
        e.preventDefault();
        clear();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setRaw(selectableOrder);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [enabled, hasSelection, escapeYields, clear, selectableOrder]);

  return {
    selected,
    selectedItems,
    isSelected: (id: string) => selected.includes(id),
    isPending: (id: string) => pending.includes(id),
    isHidden: (id: string) => hidden.includes(id),
    /** Cards in the drag in progress (dimmed while dragging). */
    isDragging: (id: string) => dragging.includes(id),
    setDragging,
    pick,
    clear,
    /** Ids a drag starting on `id` carries: the movable selection if `id` is in it, else `id`. */
    dragIds: (id: string) =>
      selected.includes(id)
        ? selectedItems.filter((i) => i.canMove).map((i) => i.id)
        : [id],
  };
}

export type BookmarkSelection = ReturnType<typeof useBookmarkSelection>;
