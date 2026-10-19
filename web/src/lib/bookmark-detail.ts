import "server-only";
import { getBookmarkForUser } from "@/lib/bookmarks";
import { getBookmarkComments } from "@/lib/comments";
import { getUserTags } from "@/lib/tags";
import { getFriends } from "@/lib/friends";
import { roleAtLeast } from "@/lib/permissions";

/**
 * Everything the bookmark detail UI needs, read once. Shared by the full
 * bookmark page and the list page's desktop side panel so the two can never
 * disagree on permissions or lock state. Null when the bookmark does not exist
 * or the viewer cannot read its list.
 */
export async function getBookmarkDetail(userId: string, bookmarkId: string) {
  const result = await getBookmarkForUser(userId, bookmarkId);
  if (!result) return null;

  const { bookmark, role } = result;
  const canEdit = roleAtLeast(role, "COLLABORATOR");
  // Which lock is in force, or null. `listIdOfWritableBookmark` refuses an edit
  // when the bookmark is locked OR its list is, so both cases have to be read
  // here; the bookmark's own lock wins the copy because it is the more specific
  // thing to say. `canWrite` gates every affordance the server would refuse;
  // delete is deliberately not one of them (trimming back under the cap is how a
  // lapsed account gets out), so it stays on `canEdit`.
  const lockedKind = bookmark.lockedAt
    ? ("bookmark" as const)
    : bookmark.list.lockedAt
      ? ("list" as const)
      : null;
  const canWrite = canEdit && lockedKind === null;
  const tagNames = bookmark.tags.map((bt) => bt.tag.name);

  const [userTags, comments, friends] = await Promise.all([
    canWrite
      ? getUserTags(userId)
      : Promise.resolve<{ name: string; color: string }[]>([]),
    getBookmarkComments(bookmarkId, userId),
    getFriends(userId),
  ]);

  return {
    viewerId: userId,
    bookmark,
    role,
    canEdit,
    canWrite,
    lockedKind,
    comments,
    friends: friends.map((f) => f.friend),
    tagSuggestions: userTags.map((t) => t.name),
    tagColors: Object.fromEntries(userTags.map((t) => [t.name, t.color])),
    editDefaults: {
      name: bookmark.name,
      images: bookmark.images,
      urls: bookmark.urls.join("\n"),
      location: bookmark.location,
      latitude: bookmark.latitude,
      longitude: bookmark.longitude,
      rating: bookmark.rating,
      visited: bookmark.visited,
      description: bookmark.description,
      notes: bookmark.notes,
      tags: tagNames,
      videoUrl: bookmark.videoUrl,
      videoType: bookmark.videoType,
    },
  };
}

export type BookmarkDetail = NonNullable<
  Awaited<ReturnType<typeof getBookmarkDetail>>
>;
