"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  Bookmark,
  ChevronDown,
  Home,
  Inbox,
  Lock,
  MapPin,
  MessageCircle,
  Plus,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";
import type { ShellData, ShellList, ShellUsage } from "@/lib/shell";
import { LOCKED_ART } from "@/components/entitlements/LockedState";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { reorderLists } from "@/lib/actions/lists";
import {
  LIST_DRAG_TYPE,
  isBookmarkDrag,
  isDragFromList,
  readBookmarkDrag,
} from "@/lib/bookmark-dnd";
import { runMoveBookmarks } from "@/lib/bookmark-mutations";

/**
 * The interactive half of the desktop sidebar. A client component only because
 * the active row comes from `usePathname` (layouts do not re-render on
 * navigation, so the server half cannot know which page is open). All data is
 * read on the server and passed in.
 *
 * Two densities, both lg+ only: an icon rail at lg (1024 to 1279) and the full
 * 248px sidebar at xl (1280+), unless the viewer collapsed it to the rail
 * (SidebarSync; the `sbx:` variant is "xl and not collapsed"). Labels are
 * `sr-only` on the rail rather than
 * removed, so every row keeps an accessible name, and each row also carries a
 * `title` for a hover tooltip.
 *
 * List rows are also drag and drop targets (lg+ only, since the sidebar only
 * exists there): drop bookmarks dragged from a grid onto a list to move them
 * there (lists you can only view, locked lists, and the list the drag came from
 * do not accept, and dim while a bookmark drag is in progress), and drag a list
 * row within its group (your lists, or Shared with me) to reorder. Reordering
 * reuses `reorderLists`, the same per-user order Home uses, and keeps the
 * owned/shared interleaving Home shows. Bookmark drops and list drags carry
 * different drag types, so the two never trigger each other. The keyboard path
 * for moving bookmarks is the card's or bulk bar's "Move to list" menu.
 *
 * Keyboard reorder: with a list row focused, Alt+Up / Alt+Down (Option on a
 * Mac) moves it one place within its group. The new order shows at once, focus
 * stays on the row, a polite live region announces the new position, and the
 * save (the same `reorderLists`) is debounced so a run of presses is one write.
 */

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  count?: number;
  /** Screen-reader noun for the count, e.g. "unread". */
  countLabel?: string;
  active: (pathname: string) => boolean;
};

const ICON = 18;

function primaryItems(data: ShellData): NavItem[] {
  return [
    {
      href: "/",
      label: "Home",
      icon: <Home size={ICON} aria-hidden />,
      active: (p) => p === "/",
    },
    {
      href: "/bookmarks",
      label: "All bookmarks",
      icon: <Bookmark size={ICON} aria-hidden />,
      active: (p) => p === "/bookmarks",
    },
    {
      href: "/nearby",
      label: "Near me",
      icon: <MapPin size={ICON} aria-hidden />,
      active: (p) => p.startsWith("/nearby"),
    },
    {
      href: "/friends/dms",
      label: "Messages",
      icon: <MessageCircle size={ICON} aria-hidden />,
      count: data.unreadMessages,
      countLabel: "unread",
      active: (p) => p.startsWith("/friends/dms"),
    },
    {
      href: "/friends",
      label: "Friends",
      icon: <Users size={ICON} aria-hidden />,
      count: data.friendRequests,
      countLabel: "friend requests",
      active: (p) => p.startsWith("/friends") && !p.startsWith("/friends/dms"),
    },
    {
      href: "/requests",
      label: "Requests",
      icon: <Inbox size={ICON} aria-hidden />,
      count: data.listRequests,
      countLabel: "pending",
      active: (p) => p.startsWith("/requests"),
    },
  ];
}

/** Unread / pending count. Inline on the full sidebar, a corner badge on the icon rail. */
function CountBadge({ count, label }: { count: number; label?: string }) {
  return (
    <span
      className={cn(
        "bg-accent text-primary-ink min-w-5 rounded-full px-1.5 text-center text-xs leading-5 font-semibold",
        "absolute -top-1 -right-1 sbx:static sbx:ml-auto",
      )}
    >
      {count}
      {label && <span className="sr-only"> {label}</span>}
    </span>
  );
}

function NavRow({
  href,
  label,
  icon,
  active,
  count,
  countLabel,
  muted,
  trailing,
  className,
  dragProps,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  active: boolean;
  count?: number;
  countLabel?: string;
  muted?: boolean;
  trailing?: ReactNode;
  className?: string;
  dragProps?: RowProps;
}) {
  return (
    <Link
      href={href}
      title={label}
      aria-current={active ? "page" : undefined}
      {...dragProps}
      className={cn(
        "shell-item relative flex min-h-10 items-center gap-3 px-2.5 py-1.5",
        "justify-center sbx:justify-start",
        active
          ? "bg-primary text-primary-ink"
          : cn(
              "hover:bg-ink/5 hover:text-ink",
              muted ? "text-muted" : "text-ink/80",
            ),
        className,
      )}
    >
      <span className="flex w-5 shrink-0 items-center justify-center">
        {icon}
      </span>
      <span className="sr-only sbx:not-sr-only sbx:min-w-0 sbx:flex-1 sbx:truncate">
        {label}
      </span>
      {count !== undefined && count > 0 ? (
        <CountBadge count={count} label={countLabel} />
      ) : (
        trailing
      )}
    </Link>
  );
}

/** Extra props a list row's link carries (drag and drop, keyboard reorder). */
type RowProps = HTMLAttributes<HTMLAnchorElement> & {
  draggable?: boolean;
  "data-sidebar-list"?: string;
};

/** Id of the hidden hint every list row points at with aria-describedby. */
const REORDER_HINT_ID = "sidebar-reorder-hint";

/** How long keyboard reorders wait for another press before saving. */
const KEY_SAVE_DELAY = 600;

/** How a list row looks during a drag. */
type DropLook = "over" | "declined" | "before" | "after" | null;

function ListRow({
  list,
  pathname,
  look,
  dragProps,
}: {
  list: ShellList;
  pathname: string;
  look: DropLook;
  dragProps: RowProps;
}) {
  const href = `/lists/${list.id}`;
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <NavRow
      href={href}
      label={list.locked ? `${list.name} (locked)` : list.name}
      active={active}
      muted={list.locked}
      dragProps={dragProps}
      className={cn(
        look === "over" && "ring-primary bg-primary/15 text-ink ring-2 ring-inset",
        look === "declined" && "opacity-40",
        look === "before" && "shadow-[inset_0_2px_0_0_var(--primary)]",
        look === "after" && "shadow-[inset_0_-2px_0_0_var(--primary)]",
      )}
      icon={
        <span
          className={cn("text-base leading-none", list.locked && LOCKED_ART)}
          aria-hidden
        >
          {list.icon}
        </span>
      }
      trailing={
        look === "over" ? (
          <span className="text-primary hidden shrink-0 text-xs font-semibold sbx:inline">
            Move here
          </span>
        ) : (
          <span
            className={cn(
              "hidden shrink-0 items-center gap-1 text-xs sbx:flex",
              active ? "opacity-80" : "text-muted",
            )}
            aria-hidden
          >
            {list.locked && <Lock size={11} />}
            {list.bookmarkCount}
          </span>
        )
      }
    />
  );
}

/** Lists a bookmark can be dropped into: collaborator+ and not locked. */
const acceptsBookmarks = (l: ShellList) => l.role !== "VIEWER" && !l.locked;

/** Put `dragId` before or after `targetId` within `group`. */
function reorderGroup(group: string[], dragId: string, targetId: string, edge: "before" | "after") {
  const rest = group.filter((id) => id !== dragId);
  const at = rest.indexOf(targetId);
  if (at === -1) return group;
  rest.splice(edge === "before" ? at : at + 1, 0, dragId);
  return rest;
}

/** Write a reordered group back into its own slots of the full order. */
function mergeGroup(full: string[], group: Set<string>, nextGroup: string[]) {
  const queue = [...nextGroup];
  return full.map((id) => (group.has(id) ? (queue.shift() ?? id) : id));
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-muted hidden text-xs font-semibold sbx:inline">
      {children}
    </span>
  );
}

function UsageMeter({ usage }: { usage: NonNullable<ShellUsage> }) {
  const rows = [
    { label: "Lists", used: usage.listCount, max: usage.listLimit },
    { label: "Bookmarks", used: usage.bookmarkCount, max: usage.bookmarkLimit },
  ];
  const summary = rows.map((r) => `${r.used} of ${r.max} ${r.label.toLowerCase()}`).join(", ");

  return (
    <>
      {/* Full meter (full sidebar). */}
      <div className="pixel-box-sm mt-2 hidden flex-col gap-2 p-3 text-sm sbx:flex">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold">Free plan</span>
          <Link
            href="/upgrade"
            className="text-primary text-sm font-semibold hover:underline"
          >
            Upgrade
          </Link>
        </div>
        {rows.map((r) => {
          const pct = r.max > 0 ? Math.min(100, Math.round((r.used / r.max) * 100)) : 0;
          const full = r.used >= r.max;
          return (
            <div key={r.label} className="flex flex-col gap-1">
              <div className="flex justify-between text-xs">
                <span>{r.label}</span>
                <span className="text-muted">
                  {r.used} / {r.max}
                </span>
              </div>
              <div
                className="shell-meter"
                role="meter"
                aria-label={`${r.label} used`}
                aria-valuemin={0}
                aria-valuemax={r.max}
                aria-valuenow={r.used}
              >
                <div
                  className={cn("h-full", full ? "bg-warning" : "bg-primary")}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      {/* Rail (lg): one icon that still carries the numbers in its name. */}
      <Link
        href="/upgrade"
        title={`Free plan: ${summary}. Upgrade`}
        className="shell-item text-muted hover:text-ink hover:bg-ink/5 mt-1 flex min-h-10 items-center justify-center sbx:hidden"
      >
        <Sparkles size={ICON} aria-hidden />
        <span className="sr-only">Free plan: {summary}. Upgrade</span>
      </Link>
    </>
  );
}

export function SidebarNav({
  data,
  toggle,
}: {
  data: ShellData;
  /** The collapse toggle (SidebarToggle), placed under Settings. */
  toggle?: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const items = primaryItems(data);
  const hasLists = data.ownedLists.length + data.sharedLists.length > 0;

  // ---- Drag state ----
  const [bookmarkDrag, setBookmarkDrag] = useState(false);
  const [overId, setOverId] = useState<string | null>(null);
  const [listDrag, setListDrag] = useState<{ id: string; owned: boolean } | null>(null);
  const [mark, setMark] = useState<{ id: string; edge: "before" | "after" } | null>(null);

  // A bookmark drag starts in the page, outside this tree, so watch the document.
  useEffect(() => {
    function start(e: globalThis.DragEvent) {
      if (e.dataTransfer && isBookmarkDrag(e.dataTransfer)) setBookmarkDrag(true);
    }
    function end() {
      setBookmarkDrag(false);
      setOverId(null);
    }
    document.addEventListener("dragstart", start);
    document.addEventListener("dragend", end);
    document.addEventListener("drop", end);
    return () => {
      document.removeEventListener("dragstart", start);
      document.removeEventListener("dragend", end);
      document.removeEventListener("drop", end);
    };
  }, []);

  // ---- Order (optimistic after a reorder, until the server's order changes) ----
  const serverKey = data.listOrder.join(",");
  const [local, setLocal] = useState<{ key: string; order: string[] } | null>(null);
  const order = local?.key === serverKey ? local.order : data.listOrder;
  const rank = new Map(order.map((id, i) => [id, i]));
  const byOrder = (a: ShellList, b: ShellList) =>
    (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0);
  const ownedLists = [...data.ownedLists].sort(byOrder);
  const sharedLists = [...data.sharedLists].sort(byOrder);

  async function saveOrder(next: string[]) {
    setLocal({ key: serverKey, order: next });
    try {
      await reorderLists(next);
    } catch {
      setLocal(null);
      toast.error("Couldn't save the new list order.");
    }
  }

  // ---- Keyboard reorder (Alt+Up / Alt+Down on a focused list row) ----
  const [announce, setAnnounce] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refocusId = useRef<string | null>(null);

  // React moves the row's DOM node when the order changes, which drops focus,
  // so put it back on the same row after the re-render.
  useEffect(() => {
    const id = refocusId.current;
    if (!id) return;
    refocusId.current = null;
    document
      .querySelector<HTMLElement>(`[data-sidebar-list="${CSS.escape(id)}"]`)
      ?.focus();
  });

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  function moveByKey(list: ShellList, owned: boolean, delta: -1 | 1) {
    const groupLists = owned ? ownedLists : sharedLists;
    const group = groupLists.map((l) => l.id);
    const from = group.indexOf(list.id);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= group.length) {
      setAnnounce(
        `${list.name} is already ${delta < 0 ? "first" : "last"} in ${owned ? "your lists" : "shared with me"}.`,
      );
      return;
    }
    const nextGroup = reorderGroup(group, list.id, group[to], delta < 0 ? "before" : "after");
    const next = mergeGroup(order, new Set(group), nextGroup);
    setLocal({ key: serverKey, order: next });
    refocusId.current = list.id;
    setAnnounce(`${list.name} moved to position ${to + 1} of ${group.length}.`);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      void saveOrder(next);
    }, KEY_SAVE_DELAY);
  }

  function rowLook(list: ShellList): DropLook {
    if (mark?.id === list.id) return mark.edge;
    if (bookmarkDrag) return overId === list.id ? "over" : acceptsBookmarks(list) ? null : "declined";
    return null;
  }

  function rowDragProps(list: ShellList, owned: boolean) {
    const group = (owned ? ownedLists : sharedLists).map((l) => l.id);
    return {
      draggable: true,
      "data-sidebar-list": list.id,
      "aria-describedby": REORDER_HINT_ID,
      onKeyDown(e: KeyboardEvent<HTMLAnchorElement>) {
        if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
        e.preventDefault();
        moveByKey(list, owned, e.key === "ArrowUp" ? -1 : 1);
      },
      onDragStart(e: DragEvent<HTMLAnchorElement>) {
        e.dataTransfer.setData(LIST_DRAG_TYPE, list.id);
        e.dataTransfer.effectAllowed = "move";
        setListDrag({ id: list.id, owned });
      },
      onDragEnd() {
        setListDrag(null);
        setMark(null);
      },
      onDragOver(e: DragEvent<HTMLAnchorElement>) {
        const dt = e.dataTransfer;
        if (isBookmarkDrag(dt)) {
          if (!acceptsBookmarks(list) || isDragFromList(dt, list.id)) {
            dt.dropEffect = "none";
            return;
          }
          e.preventDefault();
          dt.dropEffect = "move";
          if (overId !== list.id) setOverId(list.id);
          return;
        }
        if (listDrag && listDrag.owned === owned && listDrag.id !== list.id) {
          e.preventDefault();
          dt.dropEffect = "move";
          const r = e.currentTarget.getBoundingClientRect();
          const edge = e.clientY < r.top + r.height / 2 ? "before" : "after";
          if (mark?.id !== list.id || mark.edge !== edge) setMark({ id: list.id, edge });
        }
      },
      onDragLeave(e: DragEvent<HTMLAnchorElement>) {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        if (overId === list.id) setOverId(null);
        if (mark?.id === list.id) setMark(null);
      },
      onDrop(e: DragEvent<HTMLAnchorElement>) {
        e.preventDefault();
        const payload = readBookmarkDrag(e.dataTransfer);
        setOverId(null);
        setMark(null);
        if (payload) {
          if (acceptsBookmarks(list)) {
            void runMoveBookmarks(payload.ids, { id: list.id, name: list.name }, router);
          }
          return;
        }
        if (listDrag && mark && listDrag.owned === owned && listDrag.id !== list.id) {
          const nextGroup = reorderGroup(group, listDrag.id, list.id, mark.edge);
          void saveOrder(mergeGroup(order, new Set(group), nextGroup));
        }
        setListDrag(null);
      },
    };
  }

  return (
    <>
      <nav
        aria-label="Primary"
        className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-3 sbx:px-2.5"
      >
        {items.map((item) => (
          <NavRow
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            count={item.count}
            countLabel={item.countLabel}
            active={item.active(pathname)}
          />
        ))}

        <div className="shell-divider mt-3 flex items-center justify-center pt-3 pb-1 sbx:justify-between sbx:px-2.5">
          <SectionLabel>Lists</SectionLabel>
          <Link
            href="/?newList=1"
            title="New list"
            aria-label="New list"
            className="pixel-box-sm text-muted hover:text-ink flex size-6 items-center justify-center"
          >
            <Plus size={14} aria-hidden />
          </Link>
        </div>

        {!hasLists && (
          <p className="text-muted hidden px-2.5 py-1 text-sm sbx:block">
            No lists yet.
          </p>
        )}

        {ownedLists.map((list) => (
          <ListRow
            key={list.id}
            list={list}
            pathname={pathname}
            look={rowLook(list)}
            dragProps={rowDragProps(list, true)}
          />
        ))}

        {data.sharedLists.length > 0 && (
          <details open className="group/shared mt-1">
            <summary className="text-muted hover:text-ink hidden cursor-pointer list-none items-center gap-1.5 px-2.5 py-1.5 text-xs sbx:flex [&::-webkit-details-marker]:hidden">
              <ChevronDown
                size={12}
                aria-hidden
                className="-rotate-90 transition-transform group-open/shared:rotate-0"
              />
              Shared with me
            </summary>
            {/* On the rail the summary is hidden, so a rule marks the boundary. */}
            <div className="shell-divider mx-2 my-1 sbx:hidden" aria-hidden />
            <div className="flex flex-col gap-0.5">
              {sharedLists.map((list) => (
                <ListRow
                  key={list.id}
                  list={list}
                  pathname={pathname}
                  look={rowLook(list)}
                  dragProps={rowDragProps(list, false)}
                />
              ))}
            </div>
          </details>
        )}
      </nav>

      <p id={REORDER_HINT_ID} className="sr-only">
        Press Alt (Option on a Mac) with the up or down arrow to reorder this list.
      </p>
      <p className="sr-only" aria-live="polite" role="status">
        {announce}
      </p>

      <div className="shell-divider flex flex-col gap-0.5 px-2 py-2 sbx:px-2.5">
        <NavRow
          href="/settings"
          label="Settings"
          icon={<Settings size={ICON} aria-hidden />}
          active={pathname.startsWith("/settings")}
        />
        {toggle}
        {data.usage && <UsageMeter usage={data.usage} />}
      </div>
    </>
  );
}
