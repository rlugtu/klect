"use server";

import { requireUser } from "@/lib/session";
import {
  getBookmarksWithCoords,
  countBookmarksMissingCoords,
} from "@/lib/bookmarks";
import { haversineMiles } from "@/lib/geo";
import type { BookmarkCardData } from "@/lib/types";

export type NearbyBookmark = {
  card: BookmarkCardData;
  listId: string;
  listLabel: { icon: string; name: string };
  distanceMiles: number;
};

export type NearbyResult =
  | { ok: true; data: NearbyBookmark[]; skipped: number }
  | { ok: false; error: string };

/**
 * Bookmarks within `radiusMiles` of (`lat`, `lon`), across the selected lists
 * (empty `listIds` → all of the user's lists), ordered closest→farthest. Only
 * geocoded bookmarks are considered; `skipped` counts in-scope bookmarks with a
 * typed location but no coordinates. Distances are computed in-process (personal
 * dataset — no need for SQL/PostGIS distance).
 */
export async function findNearbyBookmarks(input: {
  lat: number;
  lon: number;
  radiusMiles: number;
  listIds: string[];
}): Promise<NearbyResult> {
  const user = await requireUser();
  const { lat, lon, radiusMiles, listIds } = input;

  try {
    const [bookmarks, skipped] = await Promise.all([
      getBookmarksWithCoords(user.id, listIds),
      countBookmarksMissingCoords(user.id, listIds),
    ]);

    const data: NearbyBookmark[] = bookmarks
      .flatMap((b) => {
        if (b.latitude == null || b.longitude == null) return [];
        const distanceMiles = haversineMiles(lat, lon, b.latitude, b.longitude);
        if (distanceMiles > radiusMiles) return [];
        return [
          {
            card: {
              id: b.id,
              name: b.name,
              description: b.description,
              image: b.images[0] ?? null,
              rating: b.rating,
              visited: b.visited,
              tags: b.tags.map((bt) => bt.tag),
              commentCount: b._count.comments,
            },
            listId: b.list.id,
            listLabel: { icon: b.list.icon, name: b.list.name },
            distanceMiles,
          },
        ];
      })
      .sort((a, b) => a.distanceMiles - b.distanceMiles);

    return { ok: true, data, skipped };
  } catch (err) {
    console.warn("[nearby] search failed:", (err as Error).message);
    return { ok: false, error: `Nearby search failed: ${(err as Error).message}` };
  }
}
