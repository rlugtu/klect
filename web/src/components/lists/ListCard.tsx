import Link from "next/link";
import type { ReactNode } from "react";
import type { ListCardData } from "@/lib/types";
import { PixelBadge } from "@/components/ui/PixelBadge";
import { cn } from "@/lib/utils";

const roleLabel: Record<ListCardData["role"], string | null> = {
  OWNER: null,
  COLLABORATOR: "Collab",
  VIEWER: "Viewer",
};

/** Presentational list card. `handle` renders an optional drag grip on the left. */
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
        <span className="text-3xl shrink-0" aria-hidden>
          {list.icon}
        </span>
        <span className="flex flex-col min-w-0 gap-1">
          <span className="flex items-center gap-2">
            <span className="font-pixel text-sm truncate">{list.name}</span>
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
            <span className="text-muted text-sm truncate">
              {list.description}
            </span>
          )}
          <span className="text-muted text-sm">
            {list.bookmarkCount} bookmark{list.bookmarkCount === 1 ? "" : "s"}
            {list.memberCount > 1 && ` · ${list.memberCount} members`}
          </span>
        </span>
      </Link>
    </div>
  );
}
