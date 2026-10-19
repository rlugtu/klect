import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireOnboardedUser } from "@/lib/session";
import { getUserLists } from "@/lib/lists";
import { getBookmarkDetail } from "@/lib/bookmark-detail";
import { NearbyFinder } from "@/components/bookmarks/NearbyFinder";
import { BookmarkPanelContent } from "@/components/bookmarks/BookmarkDetailView";

/**
 * Near me. Below lg: the original single column. At lg+: results on the left,
 * the selected result's detail on the right (see NearbyFinder).
 *
 * `?b=<bookmarkId>` is the desktop selection. It is read through
 * `getBookmarkDetail`, the same read (permissions, lock state) as the full
 * bookmark page and the list side panel, so an id the viewer cannot read
 * renders the pane's "not available" note instead of anything from it.
 */
export default async function NearbyPage({
  searchParams,
}: {
  searchParams: Promise<{ b?: string | string[] }>;
}) {
  const user = await requireOnboardedUser();
  const { b } = await searchParams;
  const selectedId = typeof b === "string" && b ? b.slice(0, 64) : null;

  const [memberships, detail] = await Promise.all([
    getUserLists(user.id),
    selectedId ? getBookmarkDetail(user.id, selectedId) : Promise.resolve(null),
  ]);

  const listOptions = memberships.map((m) => ({
    id: m.listId,
    name: m.list.name,
    icon: m.list.icon,
  }));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12 lg:max-w-[1400px] lg:gap-6 lg:px-8 lg:py-8">
      <header className="flex flex-col gap-3">
        <Link
          href="/"
          className="text-muted hover:text-primary inline-flex w-fit items-center gap-1.5 text-sm lg:hidden"
        >
          <ArrowLeft size={14} aria-hidden /> Back
        </Link>
        <div>
          <h1 className="text-primary text-xl font-bold">📍 Near me</h1>
          <p className="text-muted text-sm">
            Find bookmarks close to where you are right now.
          </p>
        </div>
      </header>

      <NearbyFinder
        listOptions={listOptions}
        selectedId={selectedId}
        detail={detail ? <BookmarkPanelContent detail={detail} /> : null}
        selectedHref={
          detail ? `/lists/${detail.bookmark.list.id}/bookmarks/${detail.bookmark.id}` : null
        }
      />
    </main>
  );
}
