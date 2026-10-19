import type { MouseEvent } from "react";
import Link from "next/link";
import type { BookmarkCardData } from "@/lib/types";
import { StarRating } from "./StarRating";
import { PixelBadge } from "@/components/ui/PixelBadge";
import { LockedBadge } from "@/components/entitlements/LockedState";
import { cn } from "@/lib/utils";
import { BookmarkThumb } from "./BookmarkThumb";

const MAX_TAGS = 3;

/**
 * One-line bookmark row for the compact view (best for scanning and triage):
 * thumbnail, name, list, tags, rating. The dense sibling of BookmarkCard, with
 * the same locked treatment and the same destination.
 */
export function BookmarkRow({
  listId,
  bookmark,
  active = false,
  onOpen,
  listLabel,
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
  listLabel?: { icon: string; name: string };
}) {
  const extraTags = bookmark.tags.length - MAX_TAGS;
  return (
    <Link
      href={`/lists/${listId}/bookmarks/${bookmark.id}`}
      data-bookmark-card={bookmark.id}
      aria-current={active ? "true" : undefined}
      onClick={onOpen}
      className={cn(
        "hover:bg-ink/5 flex min-w-0 items-center gap-3 px-3 py-2.5",
        active && "bg-primary/10 outline-primary outline-2 -outline-offset-2",
      )}
    >
      <BookmarkThumb
        images={bookmark.images ?? [bookmark.image]}
        url={bookmark.url}
        name={bookmark.name}
        locked={bookmark.locked}
        size="sm"
        className="pixel-box-sm size-11"
      />

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "font-pixel min-w-0 truncate text-sm",
              bookmark.locked && "text-muted",
            )}
          >
            {bookmark.name}
          </span>
          {bookmark.locked && <LockedBadge className="px-1.5 py-0" />}
          {bookmark.visited && (
            <PixelBadge tone="success" className="shrink-0 px-1.5 py-0">
              ✔<span className="sr-only"> visited</span>
            </PixelBadge>
          )}
        </span>
        <span className="text-muted truncate text-sm">
          {listLabel && `in ${listLabel.icon} ${listLabel.name}`}
          {listLabel && bookmark.description && " · "}
          {bookmark.description}
        </span>
      </span>

      {bookmark.tags.length > 0 && (
        <span className="hidden shrink-0 items-center gap-1.5 xl:flex">
          {bookmark.tags.slice(0, MAX_TAGS).map((t) => (
            <PixelBadge
              key={t.id}
              tag
              color={t.color || undefined}
              className="px-1.5 py-0.5 text-xs"
            >
              {t.name}
            </PixelBadge>
          ))}
          {extraTags > 0 && <span className="text-muted text-xs">+{extraTags}</span>}
        </span>
      )}

      <span className="flex w-24 shrink-0 items-center justify-end gap-2 text-sm">
        {bookmark.commentCount > 0 && (
          <span className="text-muted">💬 {bookmark.commentCount}</span>
        )}
        {bookmark.rating > 0 && <StarRating value={bookmark.rating} className="text-sm" />}
      </span>
    </Link>
  );
}
