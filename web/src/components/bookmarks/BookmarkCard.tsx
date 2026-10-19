import type { MouseEvent } from "react";
import Link from "next/link";
import type { BookmarkCardData } from "@/lib/types";
import { StarRating } from "./StarRating";
import { PixelBadge } from "@/components/ui/PixelBadge";
import { LockedBadge } from "@/components/entitlements/LockedState";
import { cn } from "@/lib/utils";
import { BookmarkThumb } from "./BookmarkThumb";

/**
 * Compact bookmark card shown on the list page and in search results.
 *
 * Locked bookmarks (and bookmarks sitting in a locked list) render inactive —
 * greyed thumbnail, muted title, a "Locked" badge in the same row as the visited
 * tick — but stay clickable through to the detail page, where the read-only state
 * is explained and the still-allowed actions remain. Same treatment as a locked
 * list card, deliberately: one lock, one look.
 */
export function BookmarkCard({
  listId,
  bookmark,
  active = false,
  onOpen,
  listLabel,
  distanceLabel,
}: {
  listId: string;
  bookmark: BookmarkCardData;
  /** Highlighted as the bookmark open in the desktop side panel. */
  active?: boolean;
  /**
   * Click hook for the list grid at lg+, which may preventDefault and open the
   * side panel instead. Without it (or when it does not prevent) the card is a
   * plain link to the full bookmark page.
   */
  onOpen?: (e: MouseEvent<HTMLAnchorElement>) => void;
  /** Optional "in <list>" context, shown in cross-list search results. */
  listLabel?: { icon: string; name: string };
  /** Optional distance context (e.g. "2.3 mi away"), shown in the nearby finder. */
  distanceLabel?: string;
}) {
  return (
    <Link
      href={`/lists/${listId}/bookmarks/${bookmark.id}`}
      data-bookmark-card={bookmark.id}
      aria-current={active ? "true" : undefined}
      onClick={onOpen}
      className={cn(
        "dens-card pixel-box bg-panel flex w-full min-w-0 flex-col gap-3 p-4",
        active && "outline-primary outline-2 outline-offset-2",
      )}
    >
      {(listLabel || distanceLabel) && (
        <span className="text-muted flex items-center justify-between gap-2 text-sm min-w-0">
          {listLabel && (
            <span className="truncate min-w-0">
              in {listLabel.icon} {listLabel.name}
            </span>
          )}
          {distanceLabel && (
            <span className="shrink-0 whitespace-nowrap">{distanceLabel}</span>
          )}
        </span>
      )}
      {bookmark.image && (
        <BookmarkThumb
          images={bookmark.images ?? [bookmark.image]}
          url={bookmark.url}
          name={bookmark.name}
          locked={bookmark.locked}
          size="lg"
          className="pixel-box-sm h-36 w-full max-w-full"
        />
      )}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={cn(
                "font-pixel text-sm truncate min-w-0 flex-1",
                bookmark.locked && "text-muted",
              )}
            >
              {bookmark.name}
            </span>
            {bookmark.locked && <LockedBadge className="px-1.5 py-0.5" />}
            {bookmark.visited && (
              <PixelBadge tone="success" className="shrink-0">
                ✔
              </PixelBadge>
            )}
          </div>
          {bookmark.description && (
            <p className="text-muted text-sm truncate mt-1">
              {bookmark.description}
            </p>
          )}
        </div>
        {bookmark.rating > 0 && (
          <StarRating value={bookmark.rating} className="shrink-0 text-sm" />
        )}
      </div>

      {bookmark.tags.length > 0 && (
        <div className="flex min-w-0 flex-wrap gap-1.5">
          {bookmark.tags.map((t) => (
            <PixelBadge
              key={t.id}
              tag
              color={t.color || undefined}
              className="max-w-full break-all text-xs px-1.5 py-0.5"
            >
              {t.name}
            </PixelBadge>
          ))}
        </div>
      )}

      {bookmark.commentCount > 0 && (
        <span className="text-muted text-sm">
          💬 {bookmark.commentCount}
        </span>
      )}
    </Link>
  );
}
