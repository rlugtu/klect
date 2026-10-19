"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, LayoutGrid, List as ListIcon, Search, Tag } from "lucide-react";
import { PixelBadge } from "@/components/ui/PixelBadge";
import { cn } from "@/lib/utils";
import {
  allBookmarksHref,
  SORT_LABELS,
  type AllBookmarksState,
} from "@/lib/all-bookmarks";

const SEARCH_DEBOUNCE_MS = 300;

const CONTROL = "pixel-box-sm bg-panel text-ink h-9 px-3 text-sm";

/**
 * Filter bar for All bookmarks. Every control writes to the URL (the page is an
 * RSC that reads it), so filters are shareable, survive reloads, and need no
 * client data fetching. Search is debounced; the rest apply immediately.
 */
export function AllBookmarksToolbar({
  state,
  tags,
  lists,
}: {
  state: AllBookmarksState;
  tags: { name: string; color: string }[];
  lists: { id: string; name: string; icon: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const tagMenuRef = useRef<HTMLDivElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tagColor = new Map(tags.map((t) => [t.name, t.color]));

  function go(next: Partial<AllBookmarksState>) {
    const href = allBookmarksHref({ ...state, ...next });
    startTransition(() => router.replace(href, { scroll: false }));
  }

  function onSearchChange(value: string) {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => go({ q: value }), SEARCH_DEBOUNCE_MS);
  }

  function toggleTag(name: string) {
    go({
      tags: state.tags.includes(name)
        ? state.tags.filter((t) => t !== name)
        : [...state.tags, name],
    });
  }

  function clearAll() {
    if (searchRef.current) searchRef.current.value = "";
    go({ q: "", tags: [], list: "", sort: "recent" });
  }

  useEffect(() => () => {
    if (debounce.current) clearTimeout(debounce.current);
  }, []);

  // Close the tag menu on outside click or Escape.
  useEffect(() => {
    if (!tagMenuOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (!tagMenuRef.current?.contains(e.target as Node)) setTagMenuOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setTagMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [tagMenuOpen]);

  const filtered = Boolean(state.q || state.tags.length || state.list || state.sort !== "recent");

  return (
    <div className="flex flex-col gap-3" aria-busy={pending}>
      <div className="flex flex-wrap items-center gap-2">
        <label className={cn(CONTROL, "flex min-w-56 flex-1 items-center gap-2 lg:max-w-sm")}>
          <Search size={15} aria-hidden className="text-muted shrink-0" />
          <span className="sr-only">Search bookmarks</span>
          <input
            ref={searchRef}
            type="search"
            defaultValue={state.q}
            placeholder="Search name, description, place"
            onChange={(e) => onSearchChange(e.target.value)}
            className="placeholder:text-muted min-w-0 flex-1 bg-transparent outline-none"
          />
        </label>

        <div ref={tagMenuRef} className="relative">
          <button
            type="button"
            aria-expanded={tagMenuOpen}
            aria-controls="all-bookmarks-tags"
            onClick={() => setTagMenuOpen((o) => !o)}
            disabled={tags.length === 0}
            className={cn(CONTROL, "flex cursor-pointer items-center gap-2 disabled:opacity-50")}
          >
            <Tag size={14} aria-hidden />
            Tags{state.tags.length > 0 && ` (${state.tags.length})`}
            <ChevronDown size={14} aria-hidden />
          </button>
          {tagMenuOpen && (
            <div
              id="all-bookmarks-tags"
              className="pixel-box bg-panel absolute left-0 z-20 mt-2 max-h-80 w-60 overflow-auto p-2"
            >
              <fieldset className="flex flex-col">
                <legend className="text-muted px-2 pb-1 text-xs">
                  Show bookmarks with any of
                </legend>
                {tags.map((t) => (
                  <label
                    key={t.name}
                    className="hover:bg-ink/5 flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={state.tags.includes(t.name)}
                      onChange={() => toggleTag(t.name)}
                      className="accent-primary"
                    />
                    <span
                      className="size-3 shrink-0 rounded-full border border-black/10"
                      style={{ backgroundColor: t.color || undefined }}
                      aria-hidden
                    />
                    <span className="truncate">{t.name}</span>
                  </label>
                ))}
              </fieldset>
            </div>
          )}
        </div>

        <label className="sr-only" htmlFor="all-bookmarks-list">
          List
        </label>
        <select
          id="all-bookmarks-list"
          value={state.list}
          onChange={(e) => go({ list: e.target.value })}
          className={cn(CONTROL, "max-w-56 cursor-pointer")}
        >
          <option value="">All lists</option>
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.icon} {l.name}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor="all-bookmarks-sort">
          Sort
        </label>
        <select
          id="all-bookmarks-sort"
          value={state.sort}
          onChange={(e) => go({ sort: e.target.value as AllBookmarksState["sort"] })}
          className={cn(CONTROL, "cursor-pointer")}
        >
          {Object.entries(SORT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        {filtered && (
          <button
            type="button"
            onClick={clearAll}
            className="text-muted hover:text-ink cursor-pointer px-1 text-sm underline-offset-2 hover:underline"
          >
            Clear
          </button>
        )}

        <nav aria-label="Layout" className="pixel-box-sm bg-panel ml-auto flex overflow-hidden">
          {(
            [
              { key: "grid", label: "Grid", icon: <LayoutGrid size={14} aria-hidden /> },
              { key: "compact", label: "Compact", icon: <ListIcon size={14} aria-hidden /> },
            ] as const
          ).map((o) => (
            <Link
              key={o.key}
              href={allBookmarksHref({ ...state, view: o.key })}
              scroll={false}
              aria-current={state.view === o.key ? "true" : undefined}
              className={cn(
                "flex h-9 items-center gap-1.5 px-3 text-sm",
                state.view === o.key
                  ? "bg-primary text-primary-ink"
                  : "text-muted hover:text-ink",
              )}
            >
              {o.icon}
              {o.label}
            </Link>
          ))}
        </nav>
      </div>

      {state.tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {state.tags.map((name) => (
            <PixelBadge
              key={name}
              tag
              color={tagColor.get(name) || undefined}
              onRemove={() => toggleTag(name)}
              className="text-xs"
            >
              {name}
            </PixelBadge>
          ))}
        </div>
      )}
    </div>
  );
}
