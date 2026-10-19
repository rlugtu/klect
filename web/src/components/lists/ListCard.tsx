import Link from "next/link";
import type { ReactNode } from "react";
import type { ListCardData } from "@/lib/types";
import { PixelBadge } from "@/components/ui/PixelBadge";
import { LOCKED_ART, LockedBadge } from "@/components/entitlements/LockedState";
import { cn } from "@/lib/utils";

const roleLabel: Record<ListCardData["role"], string | null> = {
  OWNER: null,
  COLLABORATOR: "Collab",
  VIEWER: "Viewer",
};

/**
 * Presentational list card. `handle` renders an optional drag grip on the left.
 *
 * A locked list stays here and stays clickable — locked means read-only, not
 * hidden, and the whole point of preserving the rows is that the owner can still
 * open them and read what is inside. What changes is that the card reads as
 * inactive: greyed icon, muted title, and a "Locked" badge beside the name in the
 * same slot (and the same `PixelBadge` shape) as the Collab/Viewer role badge.
 */
export function ListCard({
  list,
  handle,
  className,
}: {
  list: ListCardData;
  handle?: ReactNode;
  className?: string;
}) {
  const badge = roleLabel[list.role];

  return (
    <div className={cn("pixel-box bg-panel flex items-stretch", className)}>
      {handle}
      <Link
        href={`/lists/${list.id}`}
        className="flex flex-1 items-center gap-4 p-4 min-w-0"
      >
        <span
          className={cn("text-3xl shrink-0", list.locked && LOCKED_ART)}
          aria-hidden
        >
          {list.icon}
        </span>
        <span className="flex flex-col min-w-0 gap-1">
          <span className="flex items-center gap-2">
            <span
              className={cn(
                "font-pixel text-sm truncate",
                list.locked && "text-muted",
              )}
            >
              {list.name}
            </span>
            {/* Same metrics as the role badge below, so the two sit level. */}
            {list.locked && <LockedBadge className="border px-1.5 py-0 gap-1" />}
            {badge && (
              <PixelBadge
                tone="accent"
                className="shrink-0 border px-1.5 py-0 gap-1"
              >
                {badge}
              </PixelBadge>
            )}
          </span>
          {list.description && (
            <span
              className={cn(
                "text-muted text-sm truncate",
                list.locked && "opacity-70",
              )}
            >
              {list.description}
            </span>
          )}
          <span
            className={cn("text-muted text-sm", list.locked && "opacity-70")}
          >
            {list.bookmarkCount} bookmark{list.bookmarkCount === 1 ? "" : "s"}
            {list.memberCount > 1 && ` · ${list.memberCount} members`}
          </span>
        </span>
      </Link>
    </div>
  );
}
