"use client";

import {
  Suspense,
  use,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import {
  Bookmark,
  FolderPlus,
  Home,
  Inbox,
  Keyboard,
  Lock,
  MapPin,
  MessageCircle,
  Plus,
  Search,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fuzzyFilter } from "@/lib/fuzzy";
import {
  NAV_TARGETS,
  NEW_LIST_HREF,
  bookmarkPanelHref,
  listIdFromPath,
  newBookmarkHref,
  type NavTargetId,
  type PaletteList,
} from "@/lib/commands";
import { searchPaletteBookmarks, type PaletteBookmark } from "@/lib/actions/palette";
import { BodyPortal } from "@/components/ui/BodyPortal";

const NAV_ICONS: Record<NavTargetId, LucideIcon> = {
  home: Home,
  bookmarks: Bookmark,
  nearby: MapPin,
  messages: MessageCircle,
  friends: Users,
  requests: Inbox,
  settings: Settings,
};

/** Search waits this long after the last keystroke before asking the server. */
const DEBOUNCE_MS = 200;
const MIN_SEARCH = 2;
const MAX_QUERY = 100;
const LISTS_IDLE = 6;
const LISTS_FILTERED = 8;

type GroupId = "nav" | "lists" | "bookmarks" | "actions";

const GROUP_LABEL: Record<GroupId, string> = {
  nav: "Jump to",
  lists: "Lists",
  bookmarks: "Bookmarks",
  actions: "Actions",
};

type Entry = {
  key: string;
  group: GroupId;
  label: string;
  detail?: string;
  icon: ReactNode;
  /** Shortcut hint shown on the right (already filtered by the setting). */
  keys?: string;
  locked?: boolean;
  run: () => void;
};

type SearchState = { query: string; failed: boolean; items: PaletteBookmark[] };

type Props = {
  initialQuery: string;
  lists: Promise<PaletteList[]>;
  pathname: string;
  shortcutsOn: boolean;
  onClose: () => void;
  onNavigate: (href: string) => void;
  onShowShortcuts: () => void;
};

/**
 * The desktop command palette: one modal overlay with a search field over
 * navigation, the viewer's lists, quick actions and a server bookmark search.
 *
 * Accessibility follows the combobox-with-listbox pattern: the input is the
 * combobox (`aria-activedescendant` points at the active option, focus never
 * leaves it), results are a listbox of grouped options. Arrow keys move,
 * Enter runs, Esc closes; Tab is held inside the dialog. The caller restores
 * focus on close. Portalled to <body> so it sits above the sticky top bar.
 */
export function CommandPalette(props: Props) {
  return (
    <BodyPortal>
      <div
        className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[12vh]"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) props.onClose();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          className="pixel-box bg-panel text-ink flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden"
        >
          <Suspense fallback={<PaletteLoading onClose={props.onClose} />}>
            <PaletteBody {...props} />
          </Suspense>
        </div>
      </div>
    </BodyPortal>
  );
}

function PaletteLoading({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Search size={18} aria-hidden className="text-muted shrink-0" />
      <input
        autoFocus
        aria-label="Search or jump to"
        placeholder="Loading…"
        readOnly
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
          if (e.key === "Tab") e.preventDefault();
        }}
        className="text-ink placeholder:text-muted min-w-0 flex-1 bg-transparent outline-none"
      />
    </div>
  );
}

function PaletteBody({
  initialQuery,
  lists: listsPromise,
  pathname,
  shortcutsOn,
  onClose,
  onNavigate,
  onShowShortcuts,
}: Props) {
  const lists = use(listsPromise);
  const baseId = useId();
  const listboxId = `${baseId}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(initialQuery);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [search, setSearch] = useState<SearchState | null>(null);

  const trimmed = query.trim().slice(0, MAX_QUERY);
  const wantsSearch = trimmed.length >= MIN_SEARCH;

  // Focus the field on open (the caller owns restoring focus on close).
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, []);

  // Debounced server search. Each run is cancelled by the next keystroke, and
  // a result only shows while it still matches what is typed.
  useEffect(() => {
    if (trimmed.length < MIN_SEARCH) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      let next: SearchState;
      try {
        const r = await searchPaletteBookmarks(trimmed);
        next = r.ok
          ? { query: trimmed, failed: false, items: r.items }
          : { query: trimmed, failed: true, items: [] };
      } catch {
        next = { query: trimmed, failed: true, items: [] };
      }
      if (!cancelled) setSearch(next);
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed]);

  const current = wantsSearch && search?.query === trimmed ? search : null;
  const searching = wantsSearch && current === null;

  const entries = useMemo<Entry[]>(() => {
    const go = (href: string) => () => onNavigate(href);
    const currentListId = listIdFromPath(pathname);
    const currentList = lists.find((l) => l.id === currentListId);

    const nav: Entry[] = NAV_TARGETS.map((t) => {
      const Icon = NAV_ICONS[t.id];
      return {
        key: `nav:${t.id}`,
        group: "nav",
        label: t.label,
        icon: <Icon size={16} aria-hidden />,
        keys: shortcutsOn && t.go ? `G then ${t.go.toUpperCase()}` : undefined,
        run: go(t.href),
      };
    });

    const listEntries: Entry[] = lists.map((l) => ({
      key: `list:${l.id}`,
      group: "lists",
      label: l.name,
      detail: l.locked ? "Locked list" : l.shared ? "Shared with you" : "List",
      icon: <span aria-hidden>{l.icon}</span>,
      locked: l.locked,
      run: go(`/lists/${encodeURIComponent(l.id)}`),
    }));

    const actions: Entry[] = [
      {
        key: "action:new-bookmark",
        group: "actions",
        label: "New bookmark",
        detail: currentList ? `in ${currentList.icon} ${currentList.name}` : undefined,
        icon: <Plus size={16} aria-hidden />,
        keys: shortcutsOn ? "C" : undefined,
        run: go(newBookmarkHref(pathname)),
      },
      {
        key: "action:new-list",
        group: "actions",
        label: "New list",
        icon: <FolderPlus size={16} aria-hidden />,
        run: go(NEW_LIST_HREF),
      },
      {
        key: "action:shortcuts",
        group: "actions",
        label: "Keyboard shortcuts",
        icon: <Keyboard size={16} aria-hidden />,
        keys: shortcutsOn ? "?" : undefined,
        run: onShowShortcuts,
      },
    ];

    const bookmarkEntries: Entry[] = (current?.items ?? []).map((b) => ({
      key: `bookmark:${b.id}`,
      group: "bookmarks",
      label: b.name,
      detail: `in ${b.listIcon} ${b.listName}`,
      icon: <Bookmark size={16} aria-hidden />,
      locked: b.locked,
      run: go(bookmarkPanelHref(b.listId, b.id)),
    }));

    const byLabel = (e: Entry) => e.label;
    return [
      ...fuzzyFilter(nav, trimmed, byLabel),
      ...fuzzyFilter(listEntries, trimmed, byLabel, trimmed ? LISTS_FILTERED : LISTS_IDLE),
      // Already matched server-side (name, description or location), so not
      // re-filtered here: a hit on the description must still show.
      ...bookmarkEntries,
      ...fuzzyFilter(actions, trimmed, byLabel),
    ];
  }, [lists, pathname, shortcutsOn, trimmed, current, onNavigate, onShowShortcuts]);

  const activeIndex = Math.max(
    0,
    entries.findIndex((e) => e.key === activeKey),
  );
  const active = entries[activeIndex];
  const optionId = (i: number) => `${baseId}-opt-${i}`;

  // Keep the active option in view while arrowing through a long list.
  useEffect(() => {
    document
      .getElementById(`${baseId}-opt-${activeIndex}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [baseId, activeIndex]);

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Tab") {
      // The field is the only focus stop; arrows move through results.
      e.preventDefault();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (entries.length === 0) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      const next = (activeIndex + step + entries.length) % entries.length;
      setActiveKey(entries[next].key);
    } else if (e.key === "Enter") {
      e.preventDefault();
      active?.run();
    }
  }

  const groups = (["nav", "lists", "bookmarks", "actions"] as const)
    .map((g) => ({
      id: g,
      items: entries
        .map((entry, index) => ({ entry, index }))
        .filter((r) => r.entry.group === g),
    }))
    .filter((g) => g.items.length > 0);

  const status = searching
    ? "Searching bookmarks…"
    : current?.failed
      ? "Bookmark search failed. Try again."
      : `${entries.length} result${entries.length === 1 ? "" : "s"}`;

  return (
    <>
      <div className="border-border flex shrink-0 items-center gap-3 border-b px-4 py-3">
        <Search size={18} aria-hidden className="text-muted shrink-0" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={active ? optionId(activeIndex) : undefined}
          aria-label="Search or jump to"
          placeholder="Search lists, bookmarks, or run an action"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveKey(null);
          }}
          onKeyDown={onKeyDown}
          className="text-ink placeholder:text-muted min-w-0 flex-1 bg-transparent outline-none"
        />
        <kbd className="border-border text-muted shrink-0 rounded border px-1.5 text-xs" aria-hidden>
          esc
        </kbd>
      </div>

      <div
        id={listboxId}
        role="listbox"
        aria-label="Results"
        className="min-h-0 flex-1 overflow-y-auto p-2"
      >
        {groups.map((g) => (
          <div key={g.id} role="group" aria-labelledby={`${baseId}-g-${g.id}`}>
            <div
              id={`${baseId}-g-${g.id}`}
              role="presentation"
              className="font-pixel text-muted px-2 pt-2 pb-1 text-xs"
            >
              {GROUP_LABEL[g.id]}
            </div>
            {g.items.map(({ entry, index }) => {
              const on = index === activeIndex;
              return (
                <div
                  key={entry.key}
                  id={optionId(index)}
                  role="option"
                  aria-selected={on}
                  onMouseMove={() => {
                    if (!on) setActiveKey(entry.key);
                  }}
                  // Keep focus in the field; the click itself runs the entry.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => entry.run()}
                  className={cn(
                    "cmdk-option flex cursor-pointer items-center gap-3 px-2 py-2 text-sm",
                    on ? "bg-primary text-primary-ink" : "text-ink",
                  )}
                >
                  <span className="flex size-5 shrink-0 items-center justify-center">
                    {entry.icon}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                  {entry.locked && (
                    <Lock size={12} aria-label="Locked" className="shrink-0" />
                  )}
                  {entry.detail && (
                    <span
                      className={cn(
                        "max-w-[45%] shrink-0 truncate text-xs",
                        on ? "text-primary-ink" : "text-muted",
                      )}
                    >
                      {entry.detail}
                    </span>
                  )}
                  {entry.keys && (
                    <kbd
                      className={cn(
                        "shrink-0 rounded border px-1.5 text-[11px]",
                        on ? "border-primary-ink/40" : "border-border text-muted",
                      )}
                    >
                      {entry.keys}
                    </kbd>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        {entries.length === 0 && !searching && (
          <p className="text-muted px-2 py-6 text-center text-sm">
            {current?.failed ? "Bookmark search failed. Try again." : "No matches."}
          </p>
        )}
        {searching && (
          <p className="text-muted px-2 py-2 text-xs" aria-hidden>
            Searching bookmarks…
          </p>
        )}
      </div>

      <p className="sr-only" aria-live="polite">
        {status}
      </p>

      <div className="border-border text-muted flex shrink-0 items-center gap-4 border-t px-4 py-2 text-xs" aria-hidden>
        <span>↑ ↓ navigate</span>
        <span>↵ open</span>
        <span>esc close</span>
        {!wantsSearch && <span className="ml-auto">Type 2+ letters to search bookmarks</span>}
      </div>
    </>
  );
}
