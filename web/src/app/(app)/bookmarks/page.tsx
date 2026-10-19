import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireOnboardedUser } from "@/lib/session";
import {
  BOOKMARK_SORTS,
  countVisibleBookmarks,
  getVisibleBookmarks,
  toBookmarkCardData,
  type BookmarkSort,
} from "@/lib/bookmarks";
import { getUserTags } from "@/lib/tags";
import { getCachedUserLists } from "@/lib/shell";
import { allBookmarksHref, type AllBookmarksState } from "@/lib/all-bookmarks";
import { AllBookmarksToolbar } from "@/components/bookmarks/AllBookmarksToolbar";
import { AllBookmarksResults } from "@/components/bookmarks/AllBookmarksResults";
import { PixelButton } from "@/components/ui/PixelButton";

/** Results per page; "Show more" adds another page, up to MAX_LIMIT. */
const PAGE_SIZE = 60;
const MAX_LIMIT = 600;

type SearchParams = {
  q?: string;
  tags?: string;
  list?: string;
  sort?: string;
  view?: string;
  limit?: string;
};

function parseTags(raw: string | undefined): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(",").map((t) => t.trim()).filter(Boolean))];
}

/**
 * All bookmarks: every bookmark in every list the user belongs to, in one
 * searchable, filterable grid (or compact list). Desktop-first, but a plain
 * single column below lg, so it also works on a phone.
 *
 * Filters live in the URL and are validated here, never trusted: an unknown
 * sort falls back to newest, a list id the user is not a member of is dropped,
 * and tags are matched only against the user's own tags. Access itself is
 * enforced in the query (membership), see getVisibleBookmarks.
 */
export default async function AllBookmarksPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireOnboardedUser();
  const params = await searchParams;

  const [memberships, userTags] = await Promise.all([
    getCachedUserLists(user.id),
    getUserTags(user.id),
  ]);

  const listOptions = memberships.map((m) => ({
    id: m.listId,
    name: m.list.name,
    icon: m.list.icon,
  }));
  const tagNames = new Set(userTags.map((t) => t.name));

  const state: AllBookmarksState = {
    q: (params.q ?? "").trim().slice(0, 200),
    tags: parseTags(params.tags).filter((t) => tagNames.has(t)),
    list: listOptions.some((l) => l.id === params.list) ? (params.list ?? "") : "",
    sort: BOOKMARK_SORTS.includes(params.sort as BookmarkSort)
      ? (params.sort as BookmarkSort)
      : "recent",
    view: params.view === "compact" ? "compact" : "grid",
  };
  const requested = Number.parseInt(params.limit ?? "", 10);
  const limit = Number.isFinite(requested)
    ? Math.min(MAX_LIMIT, Math.max(PAGE_SIZE, requested))
    : PAGE_SIZE;

  const filters = {
    query: state.q,
    tagNames: state.tags,
    listId: state.list || undefined,
    sort: state.sort,
  };
  const [rows, total] = await Promise.all([
    getVisibleBookmarks(user.id, filters, limit),
    countVisibleBookmarks(user.id, filters),
  ]);

  // Per-row edit rights come from the viewer's role on each row's list. The
  // server re-checks every mutation; this only decides which controls show.
  const writable = new Set(
    memberships.filter((m) => m.role !== "VIEWER").map((m) => m.listId),
  );
  const destinations = memberships
    .filter((m) => m.role !== "VIEWER" && m.list.lockedAt === null)
    .map((m) => ({ id: m.listId, name: m.list.name, icon: m.list.icon }));
  const resultRows = rows.map((b) => ({
    bookmark: toBookmarkCardData(b),
    list: { id: b.list.id, name: b.list.name, icon: b.list.icon },
    canEdit: writable.has(b.list.id),
  }));

  const filtered = Boolean(state.q || state.tags.length || state.list);
  const canShowMore = rows.length < total && limit < MAX_LIMIT;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12 lg:max-w-[1400px] lg:px-8 lg:py-8">
      <header className="flex flex-col gap-3">
        {/* The desktop sidebar is the way home at lg+. */}
        <Link
          href="/"
          className="text-muted hover:text-primary inline-flex w-fit items-center gap-1.5 text-sm lg:hidden"
        >
          <ArrowLeft size={14} aria-hidden /> Back
        </Link>
        <div>
          <h1 className="text-primary text-xl font-bold lg:text-2xl">All bookmarks</h1>
          <p className="text-muted text-sm" aria-live="polite">
            {filtered
              ? `${total} match${total === 1 ? "" : "es"}`
              : `${total} bookmark${total === 1 ? "" : "s"} across ${listOptions.length} list${listOptions.length === 1 ? "" : "s"}`}
          </p>
        </div>
      </header>

      <AllBookmarksToolbar state={state} tags={userTags} lists={listOptions} />

      {rows.length === 0 ? (
        <p className="text-muted py-8 text-center text-sm">
          {filtered
            ? "No bookmarks match these filters."
            : "No bookmarks yet. Save one and it shows up here."}
        </p>
      ) : (
        <AllBookmarksResults
          rows={resultRows}
          view={state.view}
          destinations={destinations}
        />
      )}

      {canShowMore && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-muted text-sm">
            Showing {rows.length} of {total}
          </p>
          <Link
            href={allBookmarksHref(state, { limit: String(limit + PAGE_SIZE) })}
            scroll={false}
          >
            <PixelButton variant="secondary" size="sm">
              Show more
            </PixelButton>
          </Link>
        </div>
      )}
    </main>
  );
}
