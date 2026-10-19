"use client";

import type { ReactNode } from "react";
import type { BookmarkCardData } from "@/lib/types";
import { useIsDesktop } from "@/lib/client-prefs";
import { BookmarkCard } from "./BookmarkCard";
import { BookmarkRow } from "./BookmarkRow";
import { BookmarkSelectable } from "./BookmarkSelectable";
import { BookmarkBulkBar } from "./BookmarkBulkBar";
import type { MoveDestination } from "./MoveToListMenu";
import { useBookmarkSelection, type SelectableItem } from "./useBookmarkSelection";

export type AllBookmarksRow = {
  bookmark: BookmarkCardData;
  list: { id: string; name: string; icon: string };
  /** Viewer is a collaborator+ member of this row's list. */
  canEdit: boolean;
};

/**
 * The All bookmarks result grid (or compact list). Below lg it is the same
 * plain markup as before. At lg+ each row the viewer can edit gets hover
 * actions, selection, and drag to a sidebar list; rows from lists the viewer
 * only views stay plain links. The bulk bar only offers actions that are valid
 * for every selected row (see BookmarkBulkBar). A moved card stays here (it is
 * still one of the viewer's bookmarks); the refresh updates its list label.
 */
export function AllBookmarksResults({
  rows,
  view,
  destinations,
}: {
  rows: AllBookmarksRow[];
  view: "grid" | "compact";
  destinations: MoveDestination[];
}) {
  const isDesktop = useIsDesktop();
  const items: SelectableItem[] = rows.map((r) => ({
    id: r.bookmark.id,
    name: r.bookmark.name,
    listId: r.list.id,
    url: r.bookmark.url ?? null,
    canMove: r.canEdit && !r.bookmark.locked,
    canDelete: r.canEdit,
    visited: r.bookmark.visited,
  }));
  const enabled = isDesktop && items.some((i) => i.canDelete);
  const selection = useBookmarkSelection({
    items,
    order: rows.map((r) => r.bookmark.id),
    enabled,
  });
  const itemById = new Map(items.map((i) => [i.id, i]));
  const shown = rows.filter((r) => !selection.isHidden(r.bookmark.id));

  function wrap(id: string, variant: "card" | "row", node: ReactNode) {
    const item = itemById.get(id)!;
    if (!enabled || !item.canDelete) return node;
    return (
      <BookmarkSelectable
        item={item}
        selection={selection}
        destinations={destinations}
        variant={variant}
        labelled={variant === "card"}
      >
        {node}
      </BookmarkSelectable>
    );
  }

  return (
    <>
      {view === "compact" ? (
        <div className="pixel-box bg-panel divide-border flex flex-col divide-y">
          {shown.map((r) => (
            <div key={r.bookmark.id} className="min-w-0">
              {wrap(
                r.bookmark.id,
                "row",
                <BookmarkRow
                  listId={r.list.id}
                  listLabel={{ icon: r.list.icon, name: r.list.name }}
                  bookmark={r.bookmark}
                />,
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="dens-grid grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] lg:gap-4">
          {shown.map((r) => (
            <div key={r.bookmark.id} className="flex min-w-0 [&>*]:flex-1">
              {wrap(
                r.bookmark.id,
                "card",
                <BookmarkCard
                  listId={r.list.id}
                  listLabel={{ icon: r.list.icon, name: r.list.name }}
                  bookmark={r.bookmark}
                />,
              )}
            </div>
          ))}
        </div>
      )}
      {enabled && <BookmarkBulkBar selection={selection} destinations={destinations} />}
    </>
  );
}
