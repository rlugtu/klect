"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { PixelInput } from "@/components/ui/PixelInput";
import { PixelBadge } from "@/components/ui/PixelBadge";

type ListOption = { id: string; name: string; icon: string };

const MAX_RESULTS = 6;

/**
 * Unified home search. Typing shows matching lists (navigate on click) then
 * matching tags (added as filter pills). Selected tags live in the URL (?tags=),
 * so the server renders the filtered bookmarks.
 */
export function SearchBar({
  lists,
  tags,
  selected,
}: {
  lists: ListOption[];
  tags: string[];
  selected: string[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  function pushTags(next: string[]) {
    const unique = [...new Set(next)];
    router.push(unique.length ? `/?tags=${encodeURIComponent(unique.join(","))}` : "/");
  }

  function addTag(tag: string) {
    setQuery("");
    setOpen(false);
    pushTags([...selected, tag]);
  }

  function removeTag(tag: string) {
    pushTags(selected.filter((t) => t !== tag));
  }

  function clearAll() {
    setQuery("");
    setOpen(false);
    router.push("/");
  }

  const q = query.trim().toLowerCase();
  const matchedLists = q
    ? lists.filter((l) => l.name.toLowerCase().includes(q)).slice(0, MAX_RESULTS)
    : [];
  const matchedTags = q
    ? tags
        .filter(
          (t) => t.toLowerCase().includes(q) && !selected.includes(t),
        )
        .slice(0, MAX_RESULTS)
    : [];
  const showDropdown = open && q.length > 0;
  const hasResults = matchedLists.length > 0 || matchedTags.length > 0;

  return (
    <div className="flex flex-col gap-3">
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
          placeholder="Search lists and tags…"
          aria-label="Search lists and tags"
        />

        {showDropdown && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.12 }}
            className="pixel-box bg-panel absolute z-10 mt-2 w-full max-h-80 overflow-auto p-2"
            // Keep focus on the input so option clicks register before blur.
            onMouseDown={(e) => e.preventDefault()}
          >
            {!hasResults && (
              <p className="text-muted p-2 text-sm">No matches.</p>
            )}

            {matchedLists.length > 0 && (
              <section>
                <p className="font-pixel text-muted px-2 pt-1 text-sm uppercase">
                  Lists
                </p>
                {matchedLists.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => router.push(`/lists/${l.id}`)}
                    className="hover:bg-primary/15 flex w-full items-center gap-2 px-2 py-1.5 text-left cursor-pointer"
                  >
                    <span aria-hidden>{l.icon}</span>
                    <span className="truncate">{l.name}</span>
                  </button>
                ))}
              </section>
            )}

            {matchedTags.length > 0 && (
              <section className="mt-1">
                <p className="font-pixel text-muted px-2 pt-1 text-sm uppercase">
                  Matched tags
                </p>
                {matchedTags.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => addTag(t)}
                    className="hover:bg-primary/15 flex w-full items-center gap-2 px-2 py-1.5 text-left cursor-pointer"
                  >
                    <span aria-hidden>🏷️</span>
                    <span className="truncate">{t}</span>
                  </button>
                ))}
              </section>
            )}
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
    </div>
  );
}
