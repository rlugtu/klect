"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { BookmarkCardData } from "@/lib/types";
import { BookmarkCard } from "./BookmarkCard";
import { PixelInput } from "@/components/ui/PixelInput";
import { PixelBadge } from "@/components/ui/PixelBadge";

const MAX_RESULTS = 6;

/**
 * Bookmark grid for a single list with an in-list search: type to filter cards
 * by name; matching tags appear to add as pills (OR filter). Name + tags both
 * narrow the visible grid. All client-side over the already-loaded bookmarks.
 */
export function ListBookmarks({
  listId,
  bookmarks,
}: {
  listId: string;
  bookmarks: BookmarkCardData[];
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const availableTags = [
    ...new Set(bookmarks.flatMap((b) => b.tags.map((t) => t.name))),
  ].sort((a, b) => a.localeCompare(b));

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
  function clearAll() {
    setQuery("");
    setSelected([]);
    setOpen(false);
  }

  const visible = bookmarks.filter((b) => {
    const nameOk = !q || b.name.toLowerCase().includes(q);
    const tagOk =
      selected.length === 0 || b.tags.some((t) => selected.includes(t.name));
    return nameOk && tagOk;
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
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
                  <span aria-hidden>🏷️</span>
                  <span className="truncate">{t}</span>
                </button>
              ))}
            </section>
          </motion.div>
        )}
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
                <PixelBadge tone="primary" onRemove={() => removeTag(tag)}>
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
