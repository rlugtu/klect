import Link from "next/link";
import type { ListCardData } from "@/lib/types";
import type { ListPreviewImage } from "@/lib/lists";
import { PixelBadge } from "@/components/ui/PixelBadge";
import { LOCKED_ART, LockedBadge } from "@/components/entitlements/LockedState";
import { cn } from "@/lib/utils";
import { BookmarkThumb } from "@/components/bookmarks/BookmarkThumb";

const roleLabel: Record<ListCardData["role"], string | null> = {
  OWNER: null,
  COLLABORATOR: "Collab",
  VIEWER: "Viewer",
};

const STRIP_SLOTS = 3;

/**
 * Desktop home list card: icon, name, counts, and a strip of the list's three
 * newest bookmark photos. The grid sibling of ListCard (which stays the mobile
 * and compact-view row); same badges and the same locked treatment, so a list
 * reads the same in both.
 *
 * Empty slots render as quiet tinted tiles rather than collapsing, so cards in a
 * row keep one height whether a list has three photos or none.
 */
export function ListGridCard({
  list,
  previews,
}: {
  list: ListCardData;
  previews: ListPreviewImage[];
}) {
  const badge = roleLabel[list.role];
  const slots = Array.from({ length: STRIP_SLOTS }, (_, i) => previews[i] ?? null);

  return (
    <Link
      href={`/lists/${list.id}`}
      className="dens-card pixel-box pixel-press bg-panel flex min-w-0 flex-col gap-3 p-4"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            "shell-thumb-empty pixel-box-sm flex size-11 shrink-0 items-center justify-center text-2xl",
            list.locked && LOCKED_ART,
          )}
          aria-hidden
        >
          {list.icon}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                "font-pixel truncate text-sm font-semibold",
                list.locked && "text-muted",
              )}
            >
              {list.name}
            </span>
            {list.locked && <LockedBadge className="gap-1 border px-1.5 py-0" />}
            {badge && (
              <PixelBadge tone="accent" className="shrink-0 gap-1 border px-1.5 py-0">
                {badge}
              </PixelBadge>
            )}
          </span>
          <span className="text-muted truncate text-sm">
            {list.bookmarkCount} bookmark{list.bookmarkCount === 1 ? "" : "s"}
            {list.memberCount > 1 && ` · ${list.memberCount} members`}
          </span>
        </span>
      </span>

      <span className="grid grid-cols-3 gap-1.5" aria-hidden>
        {slots.map((img, i) =>
          img ? (
            <BookmarkThumb
              key={i}
              images={img.images.length > 0 ? img.images : [img.src]}
              url={img.url}
              name={img.name}
              locked={img.locked}
              size="sm"
              className="pixel-box-sm h-16 w-full"
            />
          ) : (
            <span key={i} className="shell-thumb-empty pixel-box-sm block h-16" />
          ),
        )}
      </span>
    </Link>
  );
}
