import "server-only";
import { prisma } from "@/lib/db";
import { assertRole } from "@/lib/permissions";

/**
 * Remove a tag (by name) from every bookmark in a list — requires COLLABORATOR+.
 *
 * Tags are user-scoped and shared across all of a user's lists, and a list's bookmarks
 * can carry the same tag name from several members. This deletes only the `BookmarkTag`
 * join rows scoped to `listId` (across all owners), so the tag disappears from this list
 * while the underlying user-scoped `Tag` rows survive for the user's other lists. Name is
 * normalized to match how tags are stored (lowercased, `#` stripped — see
 * `normalizeTagNames` in `core/bookmarks.ts`). Returns how many links were removed.
 */
export async function removeTagFromList(userId: string, listId: string, name: string) {
  await assertRole(userId, listId, "COLLABORATOR");
  const tagName = name.trim().replace(/^#+/, "").trim().toLowerCase();
  if (!tagName) return { removed: 0 };
  const { count } = await prisma.bookmarkTag.deleteMany({
    where: { tag: { name: tagName }, bookmark: { listId } },
  });
  return { removed: count };
}
