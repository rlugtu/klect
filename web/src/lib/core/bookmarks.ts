import "server-only";
import { prisma } from "@/lib/db";
import { assertRole } from "@/lib/permissions";
import { createListRecord } from "@/lib/lists";
import { randomTagColor } from "@/lib/tag-colors";
import { isTrustedIframeUrl } from "@/lib/video";

/**
 * Raw-ish bookmark input as a caller extracts it (from FormData on web, or JSON on
 * the tRPC surface). Business normalization (trimming, dedup, rating clamp, video
 * trust-check) happens here in core so both transports get identical behavior.
 */
export type BookmarkInput = {
  name: string;
  description: string;
  urls: string[];
  images: string[];
  notes: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  rating: number;
  visited: boolean;
  videoUrl: string;
  videoType: string;
  tagNames: string[];
};

/** Normalize input into exactly the columns Prisma stores on a bookmark. */
function normalizeFields(input: BookmarkInput) {
  const name = input.name.trim();
  if (!name) throw new Error("Bookmark name is required.");

  const urls = input.urls.map((u) => u.trim()).filter(Boolean);
  const images = [...new Set(input.images.map((u) => u.trim()).filter(Boolean))];

  const rating = Number.isFinite(input.rating)
    ? Math.min(5, Math.max(0, Math.round(input.rating)))
    : 0;

  // Video: keep only a trusted-host iframe embed or an https direct file.
  let videoType = input.videoType.trim();
  let videoUrl = input.videoUrl.trim();
  const okFile = videoType === "file" && /^https:\/\//i.test(videoUrl);
  const okIframe = videoType === "iframe" && isTrustedIframeUrl(videoUrl);
  if (!okFile && !okIframe) {
    videoType = "";
    videoUrl = "";
  }

  return {
    name,
    description: input.description.trim(),
    urls,
    images,
    notes: input.notes.trim(),
    location: input.location.trim(),
    latitude: input.latitude,
    longitude: input.longitude,
    rating,
    visited: input.visited,
    videoUrl,
    videoType,
  };
}

function normalizeTagNames(names: string[]): string[] {
  return [...new Set(names.map((t) => t.trim()).filter(Boolean))];
}

/**
 * Set the acting user's tags on a bookmark to exactly `names` (upsert + prune).
 * New tags are assigned a random color, avoiding colors already used by other
 * tags in `listId` (best-effort per-list uniqueness — tags are user-scoped).
 */
async function syncBookmarkTags(
  bookmarkId: string,
  userId: string,
  names: string[],
  listId: string,
) {
  // Which names already exist? (existing tags keep their color.)
  const existing = await prisma.tag.findMany({
    where: { userId, name: { in: names } },
    select: { name: true },
  });
  const existingNames = new Set(existing.map((t) => t.name));
  const newNames = names.filter((n) => !existingNames.has(n));

  // Colors to steer clear of: those already used by tags present in this list.
  const avoid = new Set<string>();
  if (newNames.length) {
    const listColors = await prisma.tag.findMany({
      where: {
        userId,
        color: { not: "" },
        bookmarks: { some: { bookmark: { listId } } },
      },
      select: { color: true },
      distinct: ["color"],
    });
    listColors.forEach((t) => avoid.add(t.color));
  }
  // Assign each new tag a color, reserving it so co-created tags don't clash.
  const colorFor = new Map<string, string>();
  for (const name of newNames) {
    const color = randomTagColor([...avoid]);
    colorFor.set(name, color);
    avoid.add(color);
  }

  const tags = await Promise.all(
    names.map((name) =>
      prisma.tag.upsert({
        where: { userId_name: { userId, name } },
        // Color is set only on insert; existing tags keep theirs (race-safe).
        create: { userId, name, color: colorFor.get(name) ?? randomTagColor() },
        update: {},
      }),
    ),
  );
  const tagIds = tags.map((t) => t.id);

  // Drop this user's tags that are no longer selected (leaves other users' tags).
  await prisma.bookmarkTag.deleteMany({
    where: { bookmarkId, tag: { userId }, NOT: { tagId: { in: tagIds } } },
  });

  if (tagIds.length) {
    await prisma.bookmarkTag.createMany({
      data: tagIds.map((tagId) => ({ bookmarkId, tagId })),
      skipDuplicates: true,
    });
  }
}

async function listIdOf(bookmarkId: string): Promise<string> {
  const bookmark = await prisma.bookmark.findUnique({
    where: { id: bookmarkId },
    select: { listId: true },
  });
  if (!bookmark) throw new Error("Bookmark not found.");
  return bookmark.listId;
}

/** Create a bookmark in a list — requires COLLABORATOR or higher. */
export async function createBookmark(
  userId: string,
  listId: string,
  input: BookmarkInput,
) {
  await assertRole(userId, listId, "COLLABORATOR");

  const bookmark = await prisma.bookmark.create({
    data: { ...normalizeFields(input), listId },
  });
  await syncBookmarkTags(bookmark.id, userId, normalizeTagNames(input.tagNames), listId);
  return bookmark;
}

/**
 * Create the same bookmark independently in each target list — existing lists
 * (by id) plus any brand-new lists (created by name). Each list gets its own
 * bookmark row + tag links, so editing or deleting one copy never affects the
 * others. Returns the ids of every list written to. Used by /bookmarks/new.
 */
export async function createBookmarkInLists(
  userId: string,
  existingListIds: string[],
  newListNames: string[],
  input: BookmarkInput,
  newListsPublic = false,
) {
  const fields = normalizeFields(input);
  const tagNames = normalizeTagNames(input.tagNames);

  const existing = [...new Set(existingListIds.filter(Boolean))];
  const newNames = [...new Set(newListNames.map((n) => n.trim()).filter(Boolean))];
  if (existing.length === 0 && newNames.length === 0) {
    throw new Error("Pick at least one list for the bookmark.");
  }

  // Must be allowed to add to each existing list.
  for (const listId of existing) {
    await assertRole(userId, listId, "COLLABORATOR");
  }

  // Create any new lists (owned by the user), collecting their ids. The
  // bookmark-create flow's Public/Private toggle sets these new lists' visibility.
  const targetIds = [...existing];
  for (const name of newNames) {
    const list = await createListRecord(userId, { name, isPublic: newListsPublic });
    targetIds.push(list.id);
  }

  // One independent bookmark row (+ its own tag links) per target list.
  for (const listId of targetIds) {
    const bookmark = await prisma.bookmark.create({ data: { ...fields, listId } });
    await syncBookmarkTags(bookmark.id, userId, tagNames, listId);
  }

  return { targetIds };
}

/** Edit a bookmark — requires COLLABORATOR. Returns its list. */
export async function updateBookmark(
  userId: string,
  bookmarkId: string,
  input: BookmarkInput,
) {
  const listId = await listIdOf(bookmarkId);
  await assertRole(userId, listId, "COLLABORATOR");

  await prisma.bookmark.update({
    where: { id: bookmarkId },
    data: normalizeFields(input),
  });
  await syncBookmarkTags(bookmarkId, userId, normalizeTagNames(input.tagNames), listId);
  return { listId };
}

/** Delete a bookmark — requires COLLABORATOR. Returns its list. */
export async function deleteBookmark(userId: string, bookmarkId: string) {
  const listId = await listIdOf(bookmarkId);
  await assertRole(userId, listId, "COLLABORATOR");

  await prisma.bookmark.delete({ where: { id: bookmarkId } });
  return { listId };
}

/** Toggle the visited flag — requires COLLABORATOR. Returns its list. */
export async function toggleVisited(userId: string, bookmarkId: string) {
  const bookmark = await prisma.bookmark.findUnique({
    where: { id: bookmarkId },
    select: { listId: true, visited: true },
  });
  if (!bookmark) throw new Error("Bookmark not found.");
  await assertRole(userId, bookmark.listId, "COLLABORATOR");

  await prisma.bookmark.update({
    where: { id: bookmarkId },
    data: { visited: !bookmark.visited },
  });
  return { listId: bookmark.listId };
}
