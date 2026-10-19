"use client";

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LayoutGrid, List as ListIcon } from "lucide-react";
import type { BookmarkCardData } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  isDesktopViewport,
  useIsDesktop,
  usePref,
  writePref,
} from "@/lib/client-prefs";
import { useListPanel } from "@/components/lists/ListDesktopLayout";
import { BookmarkCard } from "./BookmarkCard";
import { BookmarkRow } from "./BookmarkRow";
import { BookmarkSelectable } from "./BookmarkSelectable";
import { BookmarkBulkBar } from "./BookmarkBulkBar";
import type { MoveDestination } from "./MoveToListMenu";
import { useBookmarkSelection, type SelectableItem } from "./useBookmarkSelection";
import { PixelInput } from "@/components/ui/PixelInput";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelBadge } from "@/components/ui/PixelBadge";
import { Switch } from "@/components/ui/Switch";
import { toast } from "@/lib/toast";

const MAX_RESULTS = 6;

/** Desktop-only sort orders. Rows arrive newest first from the server. */
const LIST_SORTS = {
  recent: "Newest",
  oldest: "Oldest",
  rating: "Top rated",
  name: "Name A to Z",
} as const;
type ListSort = keyof typeof LIST_SORTS;

function sortBookmarks(rows: BookmarkCardData[], sort: ListSort) {
  if (sort === "recent") return rows;
  if (sort === "oldest") return [...rows].reverse();
  if (sort === "rating") return [...rows].sort((a, b) => b.rating - a.rating);
  return [...rows].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

/**
 * Bookmark grid for a single list with an in-list search: type to filter cards
 * by name; matching tags appear to add as pills (OR filter). Name + tags both
 * narrow the visible grid. All client-side over the already-loaded bookmarks.
 *
 * Collaborators (`canManageTags`) also get a trash affordance on each tag in the
 * filter dropdown that removes it from every bookmark in this list.
 *
 * At lg and up (only) the controls sit on one row and gain a sort menu and a
 * grid/compact switch (remembered per list), the grid is container-aware (2 to
 * 4 columns by the space left beside the side panel), and a plain click on a
 * card opens it in the side panel. The visible order is published to the panel
 * for prev/next. Below lg none of that renders or applies.
 *
 * Collaborators (`canEdit`) also get, at lg+ only, hover actions per card,
 * multi-select (checkbox, Shift-click range, Cmd/Ctrl-click toggle, Esc clears)
 * with a sticky bulk bar, and dragging cards onto a sidebar list to move them.
 */
export function ListBookmarks({
  listId,
  bookmarks,
  canManageTags = false,
  removeTagAction,
  canEdit = false,
  destinations = [],
}: {
  listId: string;
  bookmarks: BookmarkCardData[];
  /** When true, the tag filter dropdown shows a remove (trash) control per tag. */
  canManageTags?: boolean;
  /** Server action (pre-bound to listId) that removes a tag from the whole list. */
  removeTagAction?: (name: string) => Promise<void>;
  /** Collaborator+ member: enables desktop selection, move, and delete. */
  canEdit?: boolean;
  /** Lists the viewer can move bookmarks into (writable, unlocked, not this one). */
  destinations?: MoveDestination[];
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  // Off → all bookmarks; on → only those not yet marked visited.
  const [hideVisited, setHideVisited] = useState(false);
  // Tag name pending a remove confirmation in the filter dropdown, or null.
  const [confirmTag, setConfirmTag] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const tagMenuRef = useRef<HTMLDivElement>(null);
  const panel = useListPanel();
  const isDesktop = useIsDesktop();
  const [sort, setSort] = useState<ListSort>("recent");
  const viewKey = `klect:list-view:${listId}`;
  const storedView = usePref(viewKey);
  const view = isDesktop && storedView === "compact" ? "compact" : "grid";

  // Close the dropdown and abandon any pending remove-confirmation together.
  function closeTagMenu() {
    setTagMenuOpen(false);
    setConfirmTag(null);
  }

  // Close the tag dropdown on outside click or Escape (it's button-triggered,
  // so it doesn't ride the input's focus/blur like the typeahead does).
  useEffect(() => {
    if (!tagMenuOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (!tagMenuRef.current?.contains(e.target as Node)) closeTagMenu();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeTagMenu();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [tagMenuOpen]);

  const availableTags = [
    ...new Set(bookmarks.flatMap((b) => b.tags.map((t) => t.name))),
  ].sort((a, b) => a.localeCompare(b));

  // name → assigned color, for coloring filter pills and dropdown swatches.
  const tagColor = new Map<string, string>();
  for (const b of bookmarks) {
    for (const t of b.tags) if (t.color) tagColor.set(t.name, t.color);
  }

  const q = query.trim().toLowerCase();
  const matchedTags = q
    ? availableTags
        .filter((t) => t.toLowerCase().includes(q) && !selected.includes(t))
        .slice(0, MAX_RESULTS)
    : [];
  const showDropdown = open && q.length > 0 && matchedTags.length > 0;

  function addTag(tag: string) {
    setSelected((s) => [...new Set([...s, tag])]);
    setQuery("");
    setOpen(false);
  }
  function removeTag(tag: string) {
    setSelected((s) => s.filter((t) => t !== tag));
  }
  function toggleTag(tag: string) {
    setSelected((s) =>
      s.includes(tag) ? s.filter((t) => t !== tag) : [...s, tag],
    );
  }
  function clearAll() {
    setQuery("");
    setSelected([]);
    setOpen(false);
  }

  // How many bookmarks in this list currently carry `tag` (for the confirm copy).
  function countWithTag(tag: string) {
    return bookmarks.filter((b) => b.tags.some((t) => t.name === tag)).length;
  }

  async function removeListTag(tag: string) {
    if (!removeTagAction) return;
    setRemoving(true);
    try {
      await removeTagAction(tag);
      setSelected((s) => s.filter((t) => t !== tag));
      setConfirmTag(null);
      toast.success(`Removed #${tag} from this list`);
    } catch {
      toast.error("Couldn't remove that tag.");
    } finally {
      setRemoving(false);
    }
  }

  const filtered = bookmarks.filter((b) => {
    const nameOk = !q || b.name.toLowerCase().includes(q);
    const tagOk =
      selected.length === 0 || b.tags.some((t) => selected.includes(t.name));
    const visitedOk = !hideVisited || !b.visited;
    return nameOk && tagOk && visitedOk;
  });
  const visible = sortBookmarks(filtered, isDesktop ? sort : "recent");

  // Publish the on-screen order so the side panel's prev/next follows it.
  const orderKey = visible.map((b) => b.id).join(",");
  const setOrder = panel?.setOrder;
  useEffect(() => {
    setOrder?.(orderKey ? orderKey.split(",") : []);
  }, [orderKey, setOrder]);

  const selectItems: SelectableItem[] = bookmarks.map((b) => ({
    id: b.id,
    name: b.name,
    listId,
    url: b.url ?? null,
    canMove: canEdit && !b.locked,
    canDelete: canEdit,
    visited: b.visited,
  }));
  const selectionOn = isDesktop && canEdit;
  const panelOpenId = panel?.bookmarkId ?? null;
  const selection = useBookmarkSelection({
    items: selectItems,
    order: visible.map((b) => b.id),
    enabled: selectionOn,
    escapeYields: () => panelOpenId !== null,
    hideMovedOutOf: listId,
  });
  const itemById = new Map(selectItems.map((i) => [i.id, i]));
  const shown = visible.filter((b) => !selection.isHidden(b.id));

  function selectable(id: string, variant: "card" | "row", node: ReactNode) {
    if (!selectionOn) return node;
    return (
      <BookmarkSelectable
        item={itemById.get(id)!}
        selection={selection}
        destinations={destinations}
        variant={variant}
      >
        {node}
      </BookmarkSelectable>
    );
  }

  // lg+: a plain left click opens the side panel. Modified clicks (new tab,
  // new window) and anything below lg keep the link's full-page navigation.
  function openInPanel(e: ReactMouseEvent<HTMLAnchorElement>, id: string) {
    if (!panel || e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!isDesktopViewport()) return;
    e.preventDefault();
    panel.openBookmark(id);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-center lg:gap-3">
      <div className="flex items-center justify-between gap-3 lg:order-2 lg:justify-start">
        <span className="text-sm">Show only unvisited</span>
        <Switch
          checked={hideVisited}
          onCheckedChange={setHideVisited}
          aria-label="Show only unvisited"
        />
      </div>

      <div className="flex items-stretch gap-2 lg:order-1 lg:min-w-64 lg:flex-1">
      <div className="relative flex-1">
        <PixelInput
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Search bookmarks by name or tag…"
          aria-label="Search bookmarks"
        />

        {showDropdown && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.12 }}
            className="pixel-box bg-panel absolute z-10 mt-2 max-h-80 w-full overflow-auto p-2"
            onMouseDown={(e) => e.preventDefault()}
          >
            <section>
              <p className="font-pixel text-muted px-2 pt-1 text-sm">
                Matched tags
              </p>
              {matchedTags.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => addTag(t)}
                  className="hover:bg-primary/15 flex w-full cursor-pointer items-center gap-2 px-2 py-1.5 text-left"
                >
                  <span
                    aria-hidden
                    className="border-border inline-block h-3 w-3 shrink-0 border"
                    style={{ backgroundColor: tagColor.get(t) || "transparent" }}
                  />
                  <span className="truncate">{t}</span>
                </button>
              ))}
            </section>
          </motion.div>
        )}
      </div>

      <div className="relative" ref={tagMenuRef}>
        <PixelButton
          type="button"
          variant="secondary"
          onClick={() => (tagMenuOpen ? closeTagMenu() : setTagMenuOpen(true))}
          aria-haspopup="listbox"
          aria-expanded={tagMenuOpen}
          className="h-full normal-case"
        >
          Tags ▾
        </PixelButton>

        {tagMenuOpen && (
          <motion.div
            role="listbox"
            aria-label="Filter by tag"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.12 }}
            className="pixel-box bg-panel absolute right-0 z-10 mt-2 max-h-80 w-56 overflow-auto p-2"
          >
            {availableTags.length === 0 ? (
              <p className="text-muted p-2 text-sm">No tags in this list.</p>
            ) : (
              availableTags.map((t) => {
                const isSelected = selected.includes(t);
                if (confirmTag === t) {
                  // Inline confirm replaces the row while a remove is pending.
                  const n = countWithTag(t);
                  return (
                    <div
                      key={t}
                      className="flex w-full flex-col gap-1.5 px-2 py-1.5"
                    >
                      <span className="text-sm">
                        Remove <span className="font-bold">#{t}</span> from {n}{" "}
                        {n === 1 ? "bookmark" : "bookmarks"}?
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={removing}
                          onClick={() => removeListTag(t)}
                          className="text-danger hover:underline disabled:opacity-50 cursor-pointer text-sm font-bold"
                        >
                          Remove
                        </button>
                        <button
                          type="button"
                          disabled={removing}
                          onClick={() => setConfirmTag(null)}
                          className="text-muted hover:underline cursor-pointer text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  );
                }
                return (
                  <div
                    key={t}
                    className={`hover:bg-primary/15 flex w-full items-center gap-2 ${
                      isSelected ? "bg-primary/15 font-bold" : ""
                    }`}
                  >
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => toggleTag(t)}
                      className="flex flex-1 cursor-pointer items-center gap-2 px-2 py-1.5 text-left"
                    >
                      <span
                        aria-hidden
                        className="border-border inline-block h-3 w-3 shrink-0 border"
                        style={{
                          backgroundColor: tagColor.get(t) || "transparent",
                        }}
                      />
                      <span className="truncate">{t}</span>
                      <span aria-hidden className="text-primary ml-auto">
                        {isSelected ? "✓" : ""}
                      </span>
                    </button>
                    {canManageTags && (
                      <button
                        type="button"
                        aria-label={`Remove ${t} from this list`}
                        onClick={() => setConfirmTag(t)}
                        className="text-muted hover:text-danger shrink-0 cursor-pointer px-2 py-1.5"
                      >
                        🗑
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </motion.div>
        )}
      </div>
      </div>

      {/* Desktop only: sort + layout switch. */}
      <div className="hidden items-center gap-2 lg:order-3 lg:flex">
        <label className="sr-only" htmlFor={`list-sort-${listId}`}>
          Sort
        </label>
        <select
          id={`list-sort-${listId}`}
          value={sort}
          onChange={(e) => setSort(e.target.value as ListSort)}
          className="pixel-box-sm bg-panel text-ink h-9 cursor-pointer px-3 text-sm"
        >
          {Object.entries(LIST_SORTS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <div
          role="group"
          aria-label="Layout"
          className="pixel-box-sm bg-panel flex overflow-hidden"
        >
          {(
            [
              { key: "grid", label: "Grid", icon: LayoutGrid },
              { key: "compact", label: "Compact", icon: ListIcon },
            ] as const
          ).map((o) => (
            <button
              key={o.key}
              type="button"
              aria-pressed={view === o.key}
              onClick={() => writePref(viewKey, o.key)}
              className={cn(
                "flex h-9 cursor-pointer items-center gap-1.5 px-3 text-sm",
                view === o.key
                  ? "bg-primary text-primary-ink"
                  : "text-muted hover:text-ink",
              )}
            >
              <o.icon size={14} aria-hidden />
              {o.label}
            </button>
          ))}
        </div>
      </div>
      </div>

      {(selected.length > 0 || query.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          <AnimatePresence initial={false}>
            {selected.map((tag) => (
              <motion.span
                key={tag}
                layout
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ duration: 0.15 }}
                className="inline-flex"
              >
                <PixelBadge
                  tag
                  tone="primary"
                  color={tagColor.get(tag) || undefined}
                  onRemove={() => removeTag(tag)}
                >
                  {tag}
                </PixelBadge>
              </motion.span>
            ))}
          </AnimatePresence>
          <button
            type="button"
            onClick={clearAll}
            className="text-muted hover:text-danger cursor-pointer text-sm"
          >
            Clear all
          </button>
        </div>
      )}

      {shown.length === 0 ? (
        <p className="text-muted">No bookmarks match your search.</p>
      ) : view === "compact" ? (
        <div className="pixel-box bg-panel divide-border flex flex-col divide-y">
          {shown.map((b) => (
            <div key={b.id} className="min-w-0">
              {selectable(
                b.id,
                "row",
                <BookmarkRow
                  listId={listId}
                  bookmark={b}
                  active={panel?.bookmarkId === b.id}
                  onOpen={(e) => openInPanel(e, b.id)}
                />,
              )}
            </div>
          ))}
        </div>
      ) : (
        // lg+: columns follow the width this column actually has (it shrinks
        // when the side panel is open), so the wrapper is a size container.
        <div className="lg:@container">
          <div className="dens-grid grid gap-3 sm:grid-cols-2 lg:gap-4 lg:@2xl:grid-cols-3 lg:@5xl:grid-cols-4">
            {shown.map((b) => (
              <div
                key={b.id}
                className="col-span-1 min-w-0 sm:col-span-2 lg:col-span-1"
              >
                {selectable(
                  b.id,
                  "card",
                  <BookmarkCard
                    listId={listId}
                    bookmark={b}
                    active={panel?.bookmarkId === b.id}
                    onOpen={(e) => openInPanel(e, b.id)}
                  />,
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {selectionOn && (
        <BookmarkBulkBar selection={selection} destinations={destinations} />
      )}
    </div>
  );
}
