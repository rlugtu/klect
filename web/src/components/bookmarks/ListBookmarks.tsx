"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { BookmarkCardData } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BookmarkCard } from "./BookmarkCard";
import { PixelInput } from "@/components/ui/PixelInput";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelBadge } from "@/components/ui/PixelBadge";
import { toast } from "@/lib/toast";

const MAX_RESULTS = 6;

/**
 * Bookmark grid for a single list with an in-list search: type to filter cards
 * by name; matching tags appear to add as pills (OR filter). Name + tags both
 * narrow the visible grid. All client-side over the already-loaded bookmarks.
 *
 * Collaborators (`canManageTags`) also get a trash affordance on each tag in the
 * filter dropdown that removes it from every bookmark in this list.
 */
export function ListBookmarks({
  listId,
  bookmarks,
  canManageTags = false,
  removeTagAction,
}: {
  listId: string;
  bookmarks: BookmarkCardData[];
  /** When true, the tag filter dropdown shows a remove (trash) control per tag. */
  canManageTags?: boolean;
  /** Server action (pre-bound to listId) that removes a tag from the whole list. */
  removeTagAction?: (name: string) => Promise<void>;
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

  const visible = bookmarks.filter((b) => {
    const nameOk = !q || b.name.toLowerCase().includes(q);
    const tagOk =
      selected.length === 0 || b.tags.some((t) => selected.includes(t.name));
    const visitedOk = !hideVisited || !b.visited;
    return nameOk && tagOk && visitedOk;
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm">Show only unvisited</span>
        <button
          type="button"
          role="switch"
          aria-checked={hideVisited}
          aria-label="Show only unvisited"
          onClick={() => setHideVisited((v) => !v)}
          className={cn(
            "pixel-box-sm relative h-6 w-11 shrink-0 cursor-pointer transition-colors",
            hideVisited ? "bg-primary" : "bg-panel",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "absolute top-1/2 h-4 w-4 -translate-y-1/2 transition-transform",
              hideVisited ? "bg-primary-ink translate-x-6" : "bg-ink translate-x-0.5",
            )}
          />
        </button>
      </div>

      <div className="flex items-stretch gap-2">
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
              <p className="font-pixel text-muted px-2 pt-1 text-sm uppercase">
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

      {visible.length === 0 ? (
        <p className="text-muted">No bookmarks match your search.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visible.map((b) => (
            <div key={b.id} className="col-span-1 min-w-0 sm:col-span-2">
              <BookmarkCard listId={listId} bookmark={b} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
