"use server";

import { requireUser } from "@/lib/session";
import { getVisibleBookmarks } from "@/lib/bookmarks";

/** Most bookmark rows the command palette shows for one query. */
const PALETTE_BOOKMARK_LIMIT = 8;
const MIN_QUERY = 2;
const MAX_QUERY = 100;

export type PaletteBookmark = {
  id: string;
  name: string;
  listId: string;
  listName: string;
  listIcon: string;
  /** The bookmark or its list is locked (read-only, still findable). */
  locked: boolean;
};

export type PaletteSearchResult =
  | { ok: true; query: string; items: PaletteBookmark[] }
  | { ok: false; query: string; error: string };

/**
 * Bookmark search for the desktop command palette. A read only: it reuses the
 * All bookmarks read (`getVisibleBookmarks`), so visibility is exactly that
 * page's (membership of the bookmark's list; public lists the viewer has not
 * joined are not searched) and locked rows are included but flagged, the same
 * as everywhere else. Queries are trimmed and capped; under two characters
 * returns nothing without touching the database.
 */
export async function searchPaletteBookmarks(raw: string): Promise<PaletteSearchResult> {
  const user = await requireUser();
  const query = typeof raw === "string" ? raw.trim().slice(0, MAX_QUERY) : "";
  if (query.length < MIN_QUERY) return { ok: true, query, items: [] };

  try {
    const rows = await getVisibleBookmarks(
      user.id,
      { query, sort: "recent" },
      PALETTE_BOOKMARK_LIMIT,
    );
    return {
      ok: true,
      query,
      items: rows.map((b) => ({
        id: b.id,
        name: b.name,
        listId: b.list.id,
        listName: b.list.name,
        listIcon: b.list.icon,
        locked: b.lockedAt !== null || b.list.lockedAt !== null,
      })),
    };
  } catch (e) {
    console.warn("[palette] bookmark search failed:", (e as Error).message);
    return { ok: false, query, error: "Bookmark search failed. Try again." };
  }
}
