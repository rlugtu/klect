import type { BookmarkSort } from "@/lib/bookmarks";

/**
 * URL state for the All bookmarks page, shared by the server page (which parses
 * it) and the client toolbar (which writes it). Plain module, no server-only
 * imports, so both sides can use it. (The `BookmarkSort` import is type-only and
 * erased at compile time.)
 */
export type AllBookmarksState = {
  q: string;
  tags: string[];
  list: string;
  sort: BookmarkSort;
  view: "grid" | "compact";
};

export const SORT_LABELS: Record<AllBookmarksState["sort"], string> = {
  recent: "Newest first",
  oldest: "Oldest first",
  rating: "Highest rated",
  name: "Name A to Z",
};

/**
 * The URL for a toolbar state. Defaults are left out so the plain `/bookmarks`
 * link and a reset toolbar are the same URL. Exported for the page's own links
 * (view switch, "Show more").
 */
export function allBookmarksHref(
  state: AllBookmarksState,
  extra: Record<string, string> = {},
): string {
  const params = new URLSearchParams();
  if (state.q.trim()) params.set("q", state.q.trim());
  if (state.tags.length) params.set("tags", state.tags.join(","));
  if (state.list) params.set("list", state.list);
  if (state.sort !== "recent") params.set("sort", state.sort);
  if (state.view !== "grid") params.set("view", state.view);
  for (const [k, v] of Object.entries(extra)) params.set(k, v);
  const qs = params.toString();
  return qs ? `/bookmarks?${qs}` : "/bookmarks";
}

