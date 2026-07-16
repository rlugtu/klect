import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/session";
import { getListForViewer } from "@/lib/lists";
import { getBookmarksForList } from "@/lib/bookmarks";
import { getUserTags } from "@/lib/tags";
import { getListComments } from "@/lib/comments";
import { roleAtLeast } from "@/lib/permissions";
import { leaveList } from "@/lib/actions/sharing";
import { addListComment } from "@/lib/actions/comments";
import { CommentSection } from "@/components/comments/CommentSection";
import type { BookmarkCardData } from "@/lib/types";
import { ListPageHeader } from "@/components/lists/ListPageHeader";
import { ConfirmDeleteButton } from "@/components/ui/ConfirmDeleteButton";
import { CreateBookmarkPanel } from "@/components/bookmarks/CreateBookmarkPanel";
import { ListBookmarks } from "@/components/bookmarks/ListBookmarks";

export default async function ListPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireOnboardedUser();

  const access = await getListForViewer(user.id, id);
  if (!access) notFound();

  const { role, isMember } = access;
  const canEdit = isMember && roleAtLeast(role, "COLLABORATOR");

  const [bookmarkRows, userTags, comments] = await Promise.all([
    getBookmarksForList(id),
    getUserTags(user.id),
    getListComments(id),
  ]);
  const tagSuggestions = userTags.map((t) => t.name);
  const tagColors = Object.fromEntries(userTags.map((t) => [t.name, t.color]));

  const bookmarks: BookmarkCardData[] = bookmarkRows.map((b) => ({
    id: b.id,
    name: b.name,
    description: b.description,
    image: b.images[0] ?? null,
    rating: b.rating,
    visited: b.visited,
    tags: b.tags.map((bt) => bt.tag),
    commentCount: b._count.comments,
  }));

  // Tags already used on bookmarks in this list (for quick-add chips).
  const listTags = [
    ...new Set(bookmarkRows.flatMap((b) => b.tags.map((bt) => bt.tag.name))),
  ].sort((a, b) => a.localeCompare(b));

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12 flex flex-col gap-8">
      <ListPageHeader access={access} userId={user.id} activeKey="list" />

      {isMember && role !== "OWNER" && (
        <ConfirmDeleteButton
          action={leaveList.bind(null, id)}
          label="Leave list"
          confirmText="Leave this list?"
        />
      )}

      <section className="flex flex-col gap-4">
        {canEdit && (
          <CreateBookmarkPanel
            listId={id}
            tagSuggestions={tagSuggestions}
            listTags={listTags}
            tagColors={tagColors}
          />
        )}

        {bookmarks.length === 0 ? (
          <p className="text-muted text-sm text-center">
            {canEdit
              ? "No bookmarks yet — add your first one. 🔖"
              : "No bookmarks here yet."}
          </p>
        ) : (
          <ListBookmarks listId={id} bookmarks={bookmarks} />
        )}
      </section>

      <CommentSection
        comments={comments}
        addAction={addListComment.bind(null, id)}
        currentUserId={user.id}
        canModerate={isMember && role === "OWNER"}
        readOnly={!isMember}
      />
    </main>
  );
}
