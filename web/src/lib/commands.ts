/**
 * Shared definitions for the desktop command palette, keyboard shortcuts and
 * the top bar's add button. Plain module (no server or client-only imports),
 * so server and client components can both use it.
 */

export type NavTargetId =
  | "home"
  | "bookmarks"
  | "nearby"
  | "messages"
  | "friends"
  | "requests"
  | "settings";

export type NavTarget = {
  id: NavTargetId;
  label: string;
  href: string;
  /** Second key of the "g then <key>" shortcut, when there is one. */
  go?: string;
};

/** Top-level destinations, in sidebar order. */
export const NAV_TARGETS: readonly NavTarget[] = [
  { id: "home", label: "Home", href: "/", go: "h" },
  { id: "bookmarks", label: "All bookmarks", href: "/bookmarks", go: "b" },
  { id: "nearby", label: "Near me", href: "/nearby", go: "n" },
  { id: "messages", label: "Messages", href: "/friends/dms", go: "m" },
  { id: "friends", label: "Friends", href: "/friends" },
  { id: "requests", label: "Requests", href: "/requests" },
  { id: "settings", label: "Settings", href: "/settings" },
];

/** A list as the command palette needs it (built from the shell data). */
export type PaletteList = {
  id: string;
  name: string;
  icon: string;
  shared: boolean;
  locked: boolean;
  /** The viewer can add bookmarks here (collaborator or owner, not locked). Quick add lists only these. */
  canAdd: boolean;
};

/** The list id when `pathname` is a list page or anything under it, else null. */
export function listIdFromPath(pathname: string | null): string | null {
  const m = pathname?.match(/^\/lists\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * Where "+ Bookmark" (and the `c` shortcut) go: the standalone add flow,
 * preselecting the current list when on a list page. The add page validates
 * the id against the lists the viewer can add to and ignores anything else,
 * so a viewer-only or locked list simply arrives with nothing preselected.
 */
export function newBookmarkHref(pathname: string | null): string {
  const listId = listIdFromPath(pathname);
  return listId
    ? `/bookmarks/new?list=${encodeURIComponent(listId)}`
    : "/bookmarks/new";
}

/** The list page with a bookmark open in its desktop side panel. */
export function bookmarkPanelHref(listId: string, bookmarkId: string): string {
  return `/lists/${encodeURIComponent(listId)}?b=${encodeURIComponent(bookmarkId)}`;
}

/** The existing "new list" entry point (home opens its create panel). */
export const NEW_LIST_HREF = "/?newList=1#new-list";
