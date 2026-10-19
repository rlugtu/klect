import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/session";
import { getBookmarkDetail } from "@/lib/bookmark-detail";
import { deleteBookmark } from "@/lib/actions/bookmarks";
import { addBookmarkComment } from "@/lib/actions/comments";
import { ShareBookmarkSheet } from "@/components/bookmarks/ShareBookmarkSheet";
import { CommentSection } from "@/components/comments/CommentSection";
import { StarRating } from "@/components/bookmarks/StarRating";
import { VisitedToggle } from "@/components/bookmarks/VisitedToggle";
import { InlineRating } from "@/components/bookmarks/InlineRating";
import { BookmarkHeader } from "@/components/bookmarks/BookmarkHeader";
import { BookmarkVideo } from "@/components/bookmarks/BookmarkVideo";
import { LocationLink } from "@/components/bookmarks/LocationLink";
import { BookmarkPageDesktop } from "@/components/bookmarks/BookmarkDetailView";
import { ConfirmDeleteButton } from "@/components/ui/ConfirmDeleteButton";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelCard } from "@/components/ui/PixelCard";
import { PixelBadge } from "@/components/ui/PixelBadge";
import { LockedNotice } from "@/components/entitlements/LockedState";
import { BookmarkPhotoGrid } from "@/components/bookmarks/BookmarkGallery";

function toHref(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

export default async function BookmarkPage({
  params,
}: {
  params: Promise<{ id: string; bid: string }>;
}) {
  const { bid } = await params;
  const user = await requireOnboardedUser();

  // Permissions and lock state (canEdit / canWrite / lockedKind) are worked out
  // once in getBookmarkDetail, shared with the list page's desktop side panel.
  const detail = await getBookmarkDetail(user.id, bid);
  if (!detail) notFound();

  const {
    bookmark,
    role,
    canEdit,
    canWrite,
    lockedKind,
    comments,
    friends,
    tagSuggestions,
    tagColors,
    editDefaults,
  } = detail;
  const [primaryUrl, ...otherUrls] = bookmark.urls;

  return (
    <>
      {/* Below lg: the single-column page, unchanged. */}
      <main className="mx-auto w-full max-w-2xl px-6 py-12 flex flex-col gap-6 lg:hidden">
        <BookmarkHeader
          listId={bookmark.list.id}
          canEdit={canEdit}
          locked={lockedKind !== null}
          bookmarkId={bookmark.id}
          defaults={editDefaults}
          tagSuggestions={tagSuggestions}
          tagColors={tagColors}
        />

        {lockedKind && (
          <LockedNotice kind={lockedKind} canUpgrade={role === "OWNER"} />
        )}

        {/* Hero */}
        <PixelCard className="flex flex-col gap-4">
          <div>
            <h1 className="text-xl text-primary break-words">{bookmark.name}</h1>

            {/* Action row (Instagram-style) — sits above the rating/visited row. */}
            <div className="border-border mt-3 flex items-center gap-3 border-b-2 pb-4">
              <ShareBookmarkSheet
                bookmarkId={bookmark.id}
                friends={friends}
              />
            </div>

            {/* Locked falls back to the same read-only rating/visited pair a
                viewer sees, rather than controls whose write would be refused. */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              {canWrite ? (
                <>
                  <InlineRating bookmarkId={bookmark.id} value={bookmark.rating} />
                  <VisitedToggle
                    bookmarkId={bookmark.id}
                    visited={bookmark.visited}
                  />
                </>
              ) : (
                <>
                  {bookmark.rating > 0 && <StarRating value={bookmark.rating} />}
                  <PixelBadge tone={bookmark.visited ? "success" : "default"}>
                    {bookmark.visited ? "✔ Visited" : "Not visited"}
                  </PixelBadge>
                </>
              )}
            </div>
          </div>

          {bookmark.images.length > 0 && !bookmark.videoUrl && (
            <BookmarkPhotoGrid
              images={bookmark.images}
              url={bookmark.urls[0]}
              name={bookmark.name}
            />
          )}

          {bookmark.videoUrl && (
            <BookmarkVideo
              videoUrl={bookmark.videoUrl}
              videoType={bookmark.videoType}
              poster={bookmark.images[0]}
            />
          )}

          {bookmark.description && (
            <p className="text-lg">{bookmark.description}</p>
          )}

          {bookmark.location && (
            <LocationLink
              location={bookmark.location}
              lat={bookmark.latitude}
              lon={bookmark.longitude}
            />
          )}

          {bookmark.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {bookmark.tags.map((bt) => (
                <PixelBadge key={bt.tag.id} tag color={bt.tag.color || undefined}>
                  {bt.tag.name}
                </PixelBadge>
              ))}
            </div>
          )}

          {primaryUrl && (
            <div className="flex flex-col gap-2">
              <a href={toHref(primaryUrl)} target="_blank" rel="noopener noreferrer">
                <PixelButton className="w-full">Open ↗</PixelButton>
              </a>
              {otherUrls.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {otherUrls.map((url) => (
                    <li key={url}>
                      <a
                        href={toHref(url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary text-sm underline break-all hover:text-accent"
                      >
                        {url}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </PixelCard>

        {bookmark.notes && (
          <PixelCard>
            <h2 className="text-sm mb-2">Notes</h2>
            <p className="whitespace-pre-wrap">{bookmark.notes}</p>
          </PixelCard>
        )}

        {canEdit && (
          <div className="flex flex-wrap items-center justify-end gap-3">
            <ConfirmDeleteButton
              action={deleteBookmark.bind(null, bookmark.id)}
              label="Delete"
              confirmText="Delete this bookmark?"
            />
          </div>
        )}

        <CommentSection
          comments={comments}
          addAction={addBookmarkComment.bind(null, bookmark.id)}
          currentUserId={user.id}
          canModerate={role === "OWNER"}
        />
      </main>

      {/* lg+: two columns, media left and details right. Edit lives in the
          details column, so the header here is only the Back button. */}
      <main className="mx-auto hidden w-full max-w-6xl flex-col gap-6 px-8 py-8 lg:flex">
        <BookmarkHeader
          listId={bookmark.list.id}
          canEdit={false}
          bookmarkId={bookmark.id}
          defaults={editDefaults}
          tagSuggestions={[]}
        />
        <BookmarkPageDesktop detail={detail} />
      </main>
    </>
  );
}
