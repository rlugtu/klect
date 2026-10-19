"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { listIdFromPath, newBookmarkHref } from "@/lib/commands";
import { PixelButton } from "@/components/ui/PixelButton";

/**
 * The top bar's "+ Bookmark". On a list page it opens the add flow with that
 * list preselected (`/bookmarks/new?list=<id>`, validated by the add page);
 * everywhere else it is the plain add flow, as before.
 */
export function NewBookmarkButton() {
  const pathname = usePathname();
  const inList = listIdFromPath(pathname) !== null;
  return (
    <Link
      href={newBookmarkHref(pathname)}
      title={inList ? "New bookmark in this list" : "New bookmark"}
    >
      <PixelButton size="sm" tabIndex={-1}>
        <Plus size={14} aria-hidden /> Bookmark
      </PixelButton>
    </Link>
  );
}
