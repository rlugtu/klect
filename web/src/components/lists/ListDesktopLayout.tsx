"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Globe,
  Lock,
  Maximize2,
  MessageCircle,
  MessageSquare,
  PanelRightClose,
  PanelRightOpen,
  UserPlus,
  Users,
  Vote,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast, errorMessage } from "@/lib/toast";
import {
  isDesktopViewport,
  isTypingTarget,
  useIsDesktop,
  usePref,
  writePref,
} from "@/lib/client-prefs";
import { useShortcutsEnabled } from "@/lib/desktop-prefs";
import { setListVisibility } from "@/lib/actions/lists";
import { useListChat, ListChatInline } from "@/components/lists/ListChatLauncher";
import { PixelButton } from "@/components/ui/PixelButton";

export type PanelTab = "comments" | "chat" | "polls" | "members";

const TAB_META: Record<PanelTab, { label: string; icon: LucideIcon }> = {
  comments: { label: "Comments", icon: MessageSquare },
  chat: { label: "Chat", icon: MessageCircle },
  polls: { label: "Polls", icon: Vote },
  members: { label: "Members", icon: Users },
};

type ListPanelState = {
  /** The bookmark open in the side panel (server-resolved from `?b=`), or null. */
  bookmarkId: string | null;
  /** The visible, filtered and sorted card order, published by the bookmark grid. */
  setOrder: (ids: string[]) => void;
  openBookmark: (id: string) => void;
  selectTab: (tab: PanelTab) => void;
};

const PanelCtx = createContext<ListPanelState | null>(null);

/** The desktop list panel controls, or null outside {@link ListDesktopLayout}. */
export function useListPanel() {
  return useContext(PanelCtx);
}

type StoredPanel = { collapsed?: boolean; tab?: PanelTab };

function parseStored(raw: string | null): StoredPanel {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as StoredPanel;
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

/**
 * The list detail page's desktop frame (lg and up): the page content on the
 * left and one right-hand region that shows either the list context panel
 * (Comments, Chat, Polls, Members tabs) or, when a bookmark is open, that
 * bookmark's detail panel.
 *
 * Below lg the region is display:none and the page renders exactly as before.
 *
 * Bookmark panel routing is a `?b=<bookmarkId>` search param on the list URL,
 * not an intercepting route: interception is decided by the router, not the
 * viewport, so it would also hijack card taps on phones (which must keep
 * opening the full page), and the prev/next order is client filter state that
 * a separate route segment cannot see. The full bookmark page stays the
 * canonical URL (the card's href, the "open full page" button, refresh of a
 * bookmark URL). A `?b=` URL loaded below lg is forwarded to that full page.
 *
 * Panel collapse and the last tab are remembered per viewer in localStorage.
 */
export function ListDesktopLayout({
  listId,
  viewerId,
  bookmarkId,
  urlTab,
  tabs,
  comments,
  polls,
  members,
  bookmarkPanel,
  children,
}: {
  listId: string;
  viewerId: string;
  bookmarkId: string | null;
  /** `?tab=members|polls` from the URL: opens the panel on that tab. */
  urlTab?: PanelTab;
  /** Tabs this viewer may see (non-members: comments only). */
  tabs: PanelTab[];
  comments: ReactNode;
  polls?: ReactNode;
  members?: ReactNode;
  /** Server-rendered detail for `bookmarkId`, when one is open. */
  bookmarkPanel?: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const isDesktop = useIsDesktop();
  const chat = useListChat();
  const shortcutsOn = useShortcutsEnabled(viewerId);
  const [pending, startTransition] = useTransition();

  // ---- Persisted panel state (per viewer) ----
  const prefKey = `klect:list-panel:${viewerId}`;
  const stored = parseStored(usePref(prefKey));
  const [urlTabActive, setUrlTabActive] = useState(urlTab);
  const wanted = urlTabActive ?? stored.tab ?? "comments";
  const tab: PanelTab = tabs.includes(wanted) ? wanted : tabs[0];
  const collapsed = urlTabActive ? false : stored.collapsed === true;

  const save = useCallback(
    (next: StoredPanel) => {
      setUrlTabActive(undefined);
      writePref(prefKey, JSON.stringify({ ...stored, ...next }));
    },
    [prefKey, stored],
  );
  const selectTab = useCallback(
    (t: PanelTab) => save({ tab: t, collapsed: false }),
    [save],
  );
  const setCollapsed = (c: boolean) => save({ tab, collapsed: c });

  // ---- Bookmark panel navigation ----
  const showBookmark = Boolean(bookmarkId && bookmarkPanel);
  const [order, setOrderState] = useState<string[]>([]);
  const setOrder = useCallback((ids: string[]) => {
    setOrderState((prev) =>
      prev.length === ids.length && prev.every((v, i) => v === ids[i])
        ? prev
        : ids,
    );
  }, []);
  // True when this tab pushed the history entry the panel is showing, so
  // closing can pop it (Back then behaves) instead of stacking another entry.
  const pushedRef = useRef(false);

  const hrefWith = useCallback(
    (b: string | null) => {
      const params = new URLSearchParams(window.location.search);
      if (b) params.set("b", b);
      else params.delete("b");
      const q = params.toString();
      return q ? `${pathname}?${q}` : pathname;
    },
    [pathname],
  );

  const openBookmark = useCallback(
    (id: string) => {
      if (id === bookmarkId) return;
      const href = hrefWith(id);
      startTransition(() => {
        if (bookmarkId) {
          router.replace(href, { scroll: false });
        } else {
          pushedRef.current = true;
          router.push(href, { scroll: false });
        }
      });
    },
    [bookmarkId, hrefWith, router],
  );

  const closeBookmark = useCallback(() => {
    if (pushedRef.current) {
      pushedRef.current = false;
      router.back();
      return;
    }
    startTransition(() => router.replace(hrefWith(null), { scroll: false }));
  }, [hrefWith, router]);

  const index = bookmarkId ? order.indexOf(bookmarkId) : -1;
  const prevId = index > 0 ? order[index - 1] : null;
  const nextId =
    index === -1 ? (order[0] ?? null) : (order[index + 1] ?? null);

  // A `?b=` URL below lg (shared, or the window shrank) goes to the full page,
  // which is what a tap on a card does at that width.
  useEffect(() => {
    if (bookmarkId && !isDesktopViewport()) {
      router.replace(`/lists/${listId}/bookmarks/${bookmarkId}`);
    }
  }, [bookmarkId, listId, router]);

  // Focus: into the panel when it opens, back to the originating card when it
  // closes, and keep the active card in view while stepping.
  const panelRef = useRef<HTMLElement>(null);
  const prevBookmarkRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevBookmarkRef.current;
    prevBookmarkRef.current = showBookmark ? bookmarkId : null;
    if (!isDesktopViewport()) return;
    if (showBookmark && bookmarkId) {
      if (!prev) panelRef.current?.focus({ preventScroll: true });
      document
        .querySelector<HTMLElement>(`[data-bookmark-card="${bookmarkId}"]`)
        ?.scrollIntoView({ block: "nearest" });
    } else if (prev) {
      pushedRef.current = false;
      document
        .querySelector<HTMLElement>(`[data-bookmark-card="${prev}"]`)
        ?.focus({ preventScroll: true });
    }
  }, [showBookmark, bookmarkId]);

  // Keyboard: Esc closes, J/K and Left/Right step, never while typing or while
  // a dialog (share sheet, chat drawer, command palette) is open. J and K are
  // single-character shortcuts, so they follow the viewer's "Keyboard
  // shortcuts" setting (WCAG 2.1.4); Esc and the arrows are not character
  // keys and always work.
  useEffect(() => {
    if (!showBookmark) return;
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (!isDesktopViewport() || isTypingTarget(e.target)) return;
      if (document.querySelector('[role="dialog"]')) return;
      const next = e.key === "ArrowRight" || (shortcutsOn && e.key === "j");
      const prev = e.key === "ArrowLeft" || (shortcutsOn && e.key === "k");
      if (e.key === "Escape") {
        e.preventDefault();
        closeBookmark();
      } else if (next && nextId) {
        e.preventDefault();
        openBookmark(nextId);
      } else if (prev && prevId) {
        e.preventDefault();
        openBookmark(prevId);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showBookmark, shortcutsOn, nextId, prevId, openBookmark, closeBookmark]);

  // The Chat tab counts as an open room (mark read, no badge) only while it is
  // actually on screen.
  const chatVisible =
    isDesktop && !collapsed && tab === "chat" && !showBookmark;
  const setInlineOpen = chat?.setInlineOpen;
  useEffect(() => {
    setInlineOpen?.(chatVisible);
  }, [chatVisible, setInlineOpen]);

  const width = showBookmark
    ? "lg:w-[420px] xl:w-[500px]"
    : collapsed
      ? "lg:w-14"
      : "lg:w-[340px] xl:w-[380px]";

  return (
    <PanelCtx.Provider value={{ bookmarkId: showBookmark ? bookmarkId : null, setOrder, openBookmark, selectTab }}>
      <div className="lg:flex lg:items-start">
        <div className="lg:min-w-0 lg:flex-1">{children}</div>
        <aside
          ref={panelRef}
          tabIndex={-1}
          aria-label={showBookmark ? "Bookmark detail" : "List context"}
          aria-busy={pending}
          className={cn(
            "list-panel hidden shrink-0 flex-col outline-none transition-opacity lg:sticky lg:top-14 lg:flex lg:h-[calc(100dvh-3.5rem)]",
            width,
            // Opening or stepping waits on the server render of the detail.
            pending && "opacity-70",
          )}
        >
          {showBookmark && bookmarkId ? (
            <>
              <div className="list-panel-head flex shrink-0 items-center gap-2 px-3 py-2">
                <PixelButton
                  variant="secondary"
                  size="xs"
                  disabled={!prevId}
                  onClick={() => prevId && openBookmark(prevId)}
                  title={shortcutsOn ? "Previous bookmark (K)" : "Previous bookmark (Left arrow)"}
                  aria-label="Previous bookmark"
                >
                  <ChevronLeft size={14} aria-hidden /> Prev
                </PixelButton>
                <PixelButton
                  variant="secondary"
                  size="xs"
                  disabled={!nextId}
                  onClick={() => nextId && openBookmark(nextId)}
                  title={shortcutsOn ? "Next bookmark (J)" : "Next bookmark (Right arrow)"}
                  aria-label="Next bookmark"
                >
                  Next <ChevronRight size={14} aria-hidden />
                </PixelButton>
                <span className="text-muted ml-1 text-sm" aria-live="polite">
                  {index >= 0
                    ? `${index + 1} of ${order.length}`
                    : order.length > 0
                      ? "Not in current filter"
                      : ""}
                </span>
                <span className="flex-1" />
                <Link
                  href={`/lists/${listId}/bookmarks/${bookmarkId}`}
                  title="Open full page"
                  aria-label="Open full page"
                  className="text-muted hover:text-ink inline-flex size-8 items-center justify-center"
                >
                  <Maximize2 size={16} aria-hidden />
                </Link>
                <button
                  type="button"
                  onClick={closeBookmark}
                  title="Close (Esc)"
                  aria-label="Close bookmark panel"
                  className="text-muted hover:text-ink inline-flex size-8 cursor-pointer items-center justify-center"
                >
                  <X size={18} aria-hidden />
                </button>
              </div>
              <div key={bookmarkId} className="min-h-0 flex-1 overflow-y-auto p-4">
                {bookmarkPanel}
              </div>
            </>
          ) : collapsed ? (
            <CollapsedRail
              tabs={tabs}
              unread={chat?.unread ?? 0}
              onExpand={() => setCollapsed(false)}
              onPick={selectTab}
            />
          ) : (
            <ContextTabs
              tabs={tabs}
              tab={tab}
              unread={chat?.unread ?? 0}
              onPick={selectTab}
              onCollapse={() => setCollapsed(true)}
              panels={{ comments, polls, members }}
            />
          )}
        </aside>
      </div>
    </PanelCtx.Provider>
  );
}

function UnreadBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      aria-label={`${count} unread`}
      className={cn(
        "bg-accent text-primary-ink inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-bold",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function ContextTabs({
  tabs,
  tab,
  unread,
  onPick,
  onCollapse,
  panels,
}: {
  tabs: PanelTab[];
  tab: PanelTab;
  unread: number;
  onPick: (t: PanelTab) => void;
  onCollapse: () => void;
  panels: { comments: ReactNode; polls?: ReactNode; members?: ReactNode };
}) {
  const tabRefs = useRef<Partial<Record<PanelTab, HTMLButtonElement | null>>>({});

  // Arrow keys move between tabs (WAI-ARIA tabs pattern).
  function onTabKey(e: ReactKeyboardEvent) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const i = tabs.indexOf(tab);
    const next =
      tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
    onPick(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <>
      <div className="list-panel-head flex shrink-0 items-center gap-1 px-2">
        <div
          role="tablist"
          aria-label="List context"
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
          onKeyDown={onTabKey}
        >
          {tabs.map((t) => {
            const active = t === tab;
            return (
              <button
                key={t}
                ref={(el) => {
                  tabRefs.current[t] = el;
                }}
                type="button"
                role="tab"
                id={`list-tab-${t}`}
                aria-selected={active}
                aria-controls={`list-tabpanel-${t}`}
                tabIndex={active ? 0 : -1}
                onClick={() => onPick(t)}
                className={cn(
                  "-mb-px flex shrink-0 cursor-pointer items-center gap-1.5 border-b-2 px-2 py-3 text-sm",
                  active
                    ? "border-primary text-primary font-semibold"
                    : "text-muted hover:text-ink border-transparent",
                )}
              >
                {TAB_META[t].label}
                {t === "chat" && <UnreadBadge count={unread} />}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onCollapse}
          title="Collapse panel"
          aria-label="Collapse panel"
          className="text-muted hover:text-ink inline-flex size-8 shrink-0 cursor-pointer items-center justify-center"
        >
          <PanelRightClose size={16} aria-hidden />
        </button>
      </div>

      {tab === "chat" ? (
        <div
          role="tabpanel"
          id="list-tabpanel-chat"
          aria-labelledby="list-tab-chat"
          className="flex min-h-0 flex-1 flex-col"
        >
          <ListChatInline />
        </div>
      ) : null}
      {(["comments", "polls", "members"] as const)
        .filter((t) => tabs.includes(t))
        .map((t) => (
          // Inactive panels stay mounted (hidden) so a half-typed comment or
          // invite survives a tab switch.
          <div
            key={t}
            role="tabpanel"
            id={`list-tabpanel-${t}`}
            aria-labelledby={`list-tab-${t}`}
            hidden={tab !== t}
            className="min-h-0 flex-1 overflow-y-auto p-4"
          >
            {panels[t]}
          </div>
        ))}
    </>
  );
}

function CollapsedRail({
  tabs,
  unread,
  onExpand,
  onPick,
}: {
  tabs: PanelTab[];
  unread: number;
  onExpand: () => void;
  onPick: (t: PanelTab) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1 py-2">
      <button
        type="button"
        onClick={onExpand}
        title="Expand panel"
        aria-label="Expand panel"
        className="text-muted hover:text-ink inline-flex size-10 cursor-pointer items-center justify-center"
      >
        <PanelRightOpen size={18} aria-hidden />
      </button>
      {tabs.map((t) => {
        const Icon = TAB_META[t].icon;
        return (
          <button
            key={t}
            type="button"
            onClick={() => onPick(t)}
            title={TAB_META[t].label}
            aria-label={TAB_META[t].label}
            className="text-muted hover:text-ink relative inline-flex size-10 cursor-pointer items-center justify-center"
          >
            <Icon size={18} aria-hidden />
            {t === "chat" && (
              <UnreadBadge count={unread} className="absolute top-0.5 right-0.5" />
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Desktop-only header actions beside the list title: Share for the owner (opens
 * the panel's Members tab, where the invite form lives; other members get a
 * read-only "Members" button to the same tab) and, for the owner, the
 * public/private switch. Hidden below lg, where Members is a page tab and
 * visibility lives in the Edit list panel as before.
 */
export function ListDesktopActions({
  listId,
  isOwner,
  isPublic,
}: {
  listId: string;
  isOwner: boolean;
  isPublic: boolean;
}) {
  const panel = useListPanel();
  const router = useRouter();
  const [saving, startSaving] = useTransition();
  if (!panel) return null;

  function toggleVisibility() {
    startSaving(async () => {
      try {
        await setListVisibility(listId, !isPublic);
        toast.success(isPublic ? "List is now private" : "List is now public");
        router.refresh();
      } catch (e) {
        toast.error(errorMessage(e, "Could not change visibility"));
      }
    });
  }

  return (
    <div className="hidden items-center gap-2 lg:flex">
      {isOwner && (
        <PixelButton
          variant="secondary"
          size="xs"
          disabled={saving}
          onClick={toggleVisibility}
          title={
            isPublic
              ? "Public: anyone can view it and it shows on your profile"
              : "Private: only members can view it"
          }
        >
          {isPublic ? <Globe size={14} aria-hidden /> : <Lock size={14} aria-hidden />}
          {/* Icon-only at lg (the title needs the room), labelled from xl. */}
          <span className="sr-only xl:not-sr-only">
            {saving ? "Saving…" : isPublic ? "Make private" : "Make public"}
          </span>
        </PixelButton>
      )}
      <PixelButton
        variant="secondary"
        size="xs"
        onClick={() => panel.selectTab("members")}
      >
        {isOwner ? (
          <>
            <UserPlus size={14} aria-hidden /> Share
          </>
        ) : (
          <>
            <Users size={14} aria-hidden /> Members
          </>
        )}
      </PixelButton>
    </div>
  );
}
