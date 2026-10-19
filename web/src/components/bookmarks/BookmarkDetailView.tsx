import { ArrowUpRight } from "lucide-react";
import type { BookmarkDetail } from "@/lib/bookmark-detail";
import { deleteBookmark } from "@/lib/actions/bookmarks";
import { addBookmarkComment } from "@/lib/actions/comments";
import { cn } from "@/lib/utils";
import { CommentSection } from "@/components/comments/CommentSection";
import { ShareBookmarkSheet } from "./ShareBookmarkSheet";
import { StarRating } from "./StarRating";
import { VisitedToggle } from "./VisitedToggle";
import { InlineRating } from "./InlineRating";
import { BookmarkVideo } from "./BookmarkVideo";
import { BookmarkGallery } from "./BookmarkGallery";
import { LocationLink } from "./LocationLink";
import { BookmarkDesktopActions } from "./BookmarkDesktopActions";
import { ConfirmDeleteButton } from "@/components/ui/ConfirmDeleteButton";
import { PixelBadge } from "@/components/ui/PixelBadge";
import { LockedNotice } from "@/components/entitlements/LockedState";

function toHref(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function displayHost(url: string): string {
  try {
    return new URL(toHref(url)).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const BLOCK_TITLE = "font-pixel text-muted mb-2 text-xs";

/** Video (when there is one) or the photo gallery. Renders nothing without media. */
export function BookmarkMedia({
  detail,
  className,
}: {
  detail: BookmarkDetail;
  className?: string;
}) {
  const { bookmark } = detail;
  if (bookmark.videoUrl) {
    return (
      <div className={className}>
        <BookmarkVideo
          videoUrl={bookmark.videoUrl}
          videoType={bookmark.videoType}
          poster={bookmark.images[0]}
        />
      </div>
    );
  }
  if (bookmark.images.length === 0) return null;
  return (
    <BookmarkGallery
      images={bookmark.images}
      url={bookmark.urls[0]}
      name={bookmark.name}
      className={className}
    />
  );
}

/**
 * The bookmark's details for the desktop views (lg+): title, rating, actions
 * (open link, send, visited, edit), description, details, tags, notes, delete
 * and comments. Same data, permissions and lock rules as the mobile page
 * (`canWrite` gates rating/visited/edit; delete stays on `canEdit`).
 */
export function BookmarkInfo({
  detail,
  titleAs: Title = "h2",
}: {
  detail: BookmarkDetail;
  titleAs?: "h1" | "h2";
}) {
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
    <div className="flex flex-col gap-5">
      {lockedKind && (
        <LockedNotice kind={lockedKind} canUpgrade={role === "OWNER"} />
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-3">
          <Title className="text-primary min-w-0 flex-1 text-xl break-words">
            {bookmark.name}
          </Title>
          {bookmark.visited && (
            <PixelBadge tone="success" className="shrink-0">
              ✔ Visited
            </PixelBadge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {canWrite ? (
            <InlineRating bookmarkId={bookmark.id} value={bookmark.rating} />
          ) : (
            bookmark.rating > 0 && <StarRating value={bookmark.rating} />
          )}
          <span className="text-muted text-sm">
            in {bookmark.list.icon} {bookmark.list.name}
          </span>
        </div>
      </div>

      <BookmarkDesktopActions
        canEdit={canEdit}
        locked={lockedKind !== null}
        bookmarkId={bookmark.id}
        defaults={editDefaults}
        tagSuggestions={tagSuggestions}
        tagColors={tagColors}
      >
        {primaryUrl && (
          <a
            href={toHref(primaryUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-pixel pixel-box-sm pixel-press bg-primary text-primary-ink inline-flex items-center gap-1.5 px-3 py-1.5 text-sm"
          >
            Open link <ArrowUpRight size={14} aria-hidden />
          </a>
        )}
        <ShareBookmarkSheet bookmarkId={bookmark.id} friends={friends} />
        {canWrite ? (
          <VisitedToggle bookmarkId={bookmark.id} visited={bookmark.visited} />
        ) : (
          !bookmark.visited && <PixelBadge tone="default">Not visited</PixelBadge>
        )}
      </BookmarkDesktopActions>

      {bookmark.description && (
        <p className="whitespace-pre-line">{bookmark.description}</p>
      )}

      {(bookmark.location || primaryUrl) && (
        <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
          {bookmark.location && (
            <>
              <dt className="text-muted">Location</dt>
              <dd className="min-w-0">
                <LocationLink
                  location={bookmark.location}
                  lat={bookmark.latitude}
                  lon={bookmark.longitude}
                />
              </dd>
            </>
          )}
          {primaryUrl && (
            <>
              <dt className="text-muted">{otherUrls.length > 0 ? "Links" : "Link"}</dt>
              <dd className="flex min-w-0 flex-col gap-1">
                {[primaryUrl, ...otherUrls].map((url) => (
                  <a
                    key={url}
                    href={toHref(url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={url}
                    className="text-primary hover:text-accent truncate underline underline-offset-2"
                  >
                    {displayHost(url)}
                  </a>
                ))}
              </dd>
            </>
          )}
        </dl>
      )}

      {bookmark.tags.length > 0 && (
        <div>
          <h3 className={BLOCK_TITLE}>Tags</h3>
          <div className="flex flex-wrap gap-2">
            {bookmark.tags.map((bt) => (
              <PixelBadge key={bt.tag.id} tag color={bt.tag.color || undefined}>
                {bt.tag.name}
              </PixelBadge>
            ))}
          </div>
        </div>
      )}

      {bookmark.notes && (
        <div>
          <h3 className={BLOCK_TITLE}>Notes</h3>
          <p className="pixel-box-sm bg-panel p-3 whitespace-pre-wrap">
            {bookmark.notes}
          </p>
        </div>
      )}

      {canEdit && (
        <div className="flex justify-end">
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
        currentUserId={detail.viewerId}
        canModerate={role === "OWNER"}
        plain
      />
    </div>
  );
}

/** The side panel body: media on top, details below, one column. */
export function BookmarkPanelContent({ detail }: { detail: BookmarkDetail }) {
  return (
    <div className="flex flex-col gap-5">
      <BookmarkMedia detail={detail} />
      <BookmarkInfo detail={detail} />
    </div>
  );
}

/** The full bookmark page at lg+: media left (sticky), details right. */
export function BookmarkPageDesktop({
  detail,
  className,
}: {
  detail: BookmarkDetail;
  className?: string;
}) {
  const hasMedia = Boolean(
    detail.bookmark.videoUrl || detail.bookmark.images.length > 0,
  );
  return (
    <div
      className={cn(
        "grid items-start gap-8",
        hasMedia
          ? "grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"
          : "mx-auto w-full max-w-2xl grid-cols-1",
        className,
      )}
    >
      {hasMedia && <BookmarkMedia detail={detail} className="sticky top-20" />}
      <BookmarkInfo detail={detail} titleAs="h1" />
    </div>
  );
}
