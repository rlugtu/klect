import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/session";
import { getBookmarkForUser } from "@/lib/bookmarks";
import { getBookmarkComments } from "@/lib/comments";
import { getUserTagNames } from "@/lib/tags";
import { roleAtLeast } from "@/lib/permissions";
import { deleteBookmark } from "@/lib/actions/bookmarks";
import { addBookmarkComment } from "@/lib/actions/comments";
import { CommentSection } from "@/components/comments/CommentSection";
import { StarRating } from "@/components/bookmarks/StarRating";
import { VisitedToggle } from "@/components/bookmarks/VisitedToggle";
import { BookmarkHeader } from "@/components/bookmarks/BookmarkHeader";
import { BookmarkVideo } from "@/components/bookmarks/BookmarkVideo";
import { ConfirmDeleteButton } from "@/components/ui/ConfirmDeleteButton";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelCard } from "@/components/ui/PixelCard";
import { PixelBadge } from "@/components/ui/PixelBadge";

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

  const result = await getBookmarkForUser(user.id, bid);
  if (!result) notFound();

  const { bookmark, role } = result;
  const canEdit = roleAtLeast(role, "COLLABORATOR");
  const tagNames = bookmark.tags.map((bt) => bt.tag.name);
  const [primaryUrl, ...otherUrls] = bookmark.urls;

  const [tagSuggestions, comments] = await Promise.all([
    canEdit ? getUserTagNames(user.id) : Promise.resolve<string[]>([]),
    getBookmarkComments(bid),
  ]);

  const editDefaults = {
    name: bookmark.name,
    images: bookmark.images,
    urls: bookmark.urls.join("\n"),
    location: bookmark.location,
    rating: bookmark.rating,
    visited: bookmark.visited,
    description: bookmark.description,
    notes: bookmark.notes,
    tags: tagNames,
    videoUrl: bookmark.videoUrl,
    videoType: bookmark.videoType,
  };

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12 flex flex-col gap-6">
      <BookmarkHeader
        listId={bookmark.list.id}
        listIcon={bookmark.list.icon}
        listName={bookmark.list.name}
        canEdit={canEdit}
        bookmarkId={bookmark.id}
        defaults={editDefaults}
        tagSuggestions={tagSuggestions}
      />

      {/* Hero */}
      <PixelCard className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl text-primary break-words">{bookmark.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {bookmark.rating > 0 && <StarRating value={bookmark.rating} />}
            <PixelBadge tone={bookmark.visited ? "success" : "default"}>
              {bookmark.visited ? "✔ Visited" : "Not visited"}
            </PixelBadge>
          </div>
        </div>

        {bookmark.images.length > 0 && !bookmark.videoUrl && (
          <div
            className={`grid gap-2 ${
              bookmark.images.length > 1 ? "grid-cols-2" : "grid-cols-1"
            }`}
          >
            {bookmark.images.map((src) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={src}
                src={src}
                alt=""
                loading="lazy"
                className={`pixel-box-sm bg-panel w-full object-cover ${
                  bookmark.images.length > 1 ? "h-40" : "max-h-72"
                }`}
              />
            ))}
          </div>
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
          <p className="text-muted">📍 {bookmark.location}</p>
        )}

        {tagNames.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tagNames.map((name) => (
              <PixelBadge key={name} tone="primary">
                {name}
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <VisitedToggle bookmarkId={bookmark.id} visited={bookmark.visited} />
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
  );
}
