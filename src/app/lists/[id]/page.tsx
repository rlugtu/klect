import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/session";
import { getListForUser } from "@/lib/lists";
import { getBookmarksForList } from "@/lib/bookmarks";
import { getUserTagNames } from "@/lib/tags";
import { getListComments } from "@/lib/comments";
import { roleAtLeast } from "@/lib/permissions";
import { updateList, deleteList } from "@/lib/actions/lists";
import { leaveList } from "@/lib/actions/sharing";
import { addListComment } from "@/lib/actions/comments";
import { MembersPanel } from "@/components/sharing/MembersPanel";
import { CommentSection } from "@/components/comments/CommentSection";
import type { BookmarkCardData } from "@/lib/types";
import { ListControls } from "@/components/lists/ListControls";
import { ConfirmDeleteButton } from "@/components/ui/ConfirmDeleteButton";
import { CreateBookmarkPanel } from "@/components/bookmarks/CreateBookmarkPanel";
import { ListBookmarks } from "@/components/bookmarks/ListBookmarks";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelBadge } from "@/components/ui/PixelBadge";

export default async function ListPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireOnboardedUser();

  const membership = await getListForUser(user.id, id);
  if (!membership) notFound();

  const { list, role } = membership;
  const canEdit = roleAtLeast(role, "COLLABORATOR");
  const canDelete = role === "OWNER";
  const ownerName = list.owner.displayName ?? list.owner.name ?? "Someone";

  const [bookmarkRows, tagSuggestions, comments] = await Promise.all([
    getBookmarksForList(id),
    getUserTagNames(user.id),
    getListComments(id),
  ]);

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
      <div className="flex items-center justify-between gap-4">
        <Link href="/">
          <PixelButton variant="ghost" size="sm">
            ← Home
          </PixelButton>
        </Link>
        {role !== "OWNER" && (
          <PixelBadge tone="accent">
            {role === "COLLABORATOR" ? "Collaborator" : "Viewer"}
          </PixelBadge>
        )}
      </div>

      <header className="flex items-start gap-4">
        <span className="text-5xl" aria-hidden>
          {list.icon}
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl text-primary break-words">{list.name}</h1>
          {list.description && (
            <p className="text-muted mt-2">{list.description}</p>
          )}
          <p className="text-muted text-sm mt-2">
            {list._count.bookmarks} bookmark
            {list._count.bookmarks === 1 ? "" : "s"} · owned by {ownerName}
            {list._count.memberships > 1 &&
              ` · ${list._count.memberships} members`}
          </p>
        </div>
      </header>

      {canEdit && (
        <ListControls
          editAction={updateList.bind(null, id)}
          defaults={{
            name: list.name,
            description: list.description,
            icon: list.icon,
          }}
          deleteAction={canDelete ? deleteList.bind(null, id) : undefined}
          shareChildren={
            role === "OWNER" ? (
              <MembersPanel listId={id} currentUserId={user.id} />
            ) : undefined
          }
        />
      )}

      {role !== "OWNER" && (
        <ConfirmDeleteButton
          action={leaveList.bind(null, id)}
          label="Leave list"
          confirmText="Leave this list?"
        />
      )}

      <section className="flex flex-col gap-4">
        <h2 className="font-pixel text-sm">Bookmarks</h2>
        {canEdit && (
          <CreateBookmarkPanel
            listId={id}
            tagSuggestions={tagSuggestions}
            listTags={listTags}
          />
        )}

        {bookmarks.length === 0 ? (
          <p className="text-muted">
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
        canModerate={role === "OWNER"}
      />
    </main>
  );
}
