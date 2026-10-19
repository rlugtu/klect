import "server-only";
import { prisma } from "@/lib/db";
import { getBookmarkForUser } from "@/lib/bookmarks";
import { assertRole } from "@/lib/permissions";
import { createListRecord } from "@/lib/lists";
import { LIST_NAME_MAX, LockedError, assertListUnlocked } from "@/lib/core/lists";
import {
  assertCanCreateBookmark,
  assertCanCreateList,
} from "@/lib/core/entitlements";
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

/**
 * A self-contained snapshot of a bookmark, captured at the moment it's shared over a DM
 * and stored on the message. It carries only the fields that make sense to copy — the
 * personal signals `rating`/`visited` are deliberately omitted (they reset on save). Being
 * a snapshot (not a live reference) means the shared card renders + saves even if the
 * source bookmark or its list is later deleted or made private, and never leaks a private
 * list's contents.
 */
export type SharedBookmarkSnapshot = {
  name: string;
  description: string;
  urls: string[];
  images: string[];
  notes: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
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
    ? Math.min(5, Math.max(0, Math.round(input.rating * 2) / 2)) // snap to half-steps
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
  // Lowercase + trim so casing variants ("Coffee" / "coffee") never create duplicate
  // user-scoped tags. The leading "#" is a UI-only affordance (see mobile TagPill) and is
  // stripped here defensively in case a client sends it — tags are never stored with a "#".
  return [
    ...new Set(
      names.map((t) => t.trim().replace(/^#+/, "").trim().toLowerCase()).filter(Boolean),
    ),
  ];
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

/**
 * The id of the list a bookmark lives in, with no lock check. Used by the mutations
 * that stay available on a locked bookmark (deleting one), where the only thing
 * needed is the list to revalidate afterwards.
 */
async function listIdOfBookmark(bookmarkId: string): Promise<string> {
  const bookmark = await prisma.bookmark.findUnique({
    where: { id: bookmarkId },
    select: { listId: true },
  });
  if (!bookmark) throw new Error("Bookmark not found.");
  return bookmark.listId;
}

/**
 * The id of the list a bookmark lives in, refusing locked targets. A bookmark is
 * unwritable both when it is itself locked and when its list is, since a locked
 * list is wholly read-only; either case throws {@link LockedError} so the caller
 * can branch on the cause rather than on the message text.
 *
 * Edit-style mutations only. Deletes use {@link listIdOfBookmark} instead, because
 * removing your own content is how an over-cap user trims back under the free cap
 * (see the note on `LockedError` in core/lists.ts).
 */
async function listIdOfWritableBookmark(bookmarkId: string): Promise<string> {
  const bookmark = await prisma.bookmark.findUnique({
    where: { id: bookmarkId },
    select: { listId: true, lockedAt: true, list: { select: { lockedAt: true } } },
  });
  if (!bookmark) throw new Error("Bookmark not found.");
  if (bookmark.lockedAt) throw new LockedError("bookmark");
  if (bookmark.list.lockedAt) throw new LockedError("list");
  return bookmark.listId;
}

/**
 * How many of `listIds` the user owns. Ownership is what the free bookmark cap
 * counts: a bookmark saved into someone else's list is collaboration, which is
 * never capped, so it must not be counted here.
 */
async function countOwnedLists(userId: string, listIds: string[]): Promise<number> {
  if (listIds.length === 0) return 0;
  return prisma.list.count({ where: { id: { in: listIds }, ownerId: userId } });
}

/**
 * Create a bookmark in a list — requires COLLABORATOR or higher.
 *
 * Counts against the free bookmark cap only when the target list is one the caller
 * owns. Saving into a friend's list is collaboration, which is never gated, and it
 * consumes the list owner's capacity rather than the adder's.
 *
 * Refuses a locked target list. A locked list is read-only everywhere else (see
 * {@link LockedError} in core/lists.ts), and this is the write path that makes that
 * matter most for the cap: `countActiveOwnedBookmarks` excludes everything inside a
 * locked list, so a bookmark written into one would never count against the free
 * limit. Without this guard that is unbounded free storage, not an edge case. Both
 * pickers already hide locked lists; this is the server-side backstop that makes the
 * client filter a convenience rather than the enforcement.
 */
export async function createBookmark(
  userId: string,
  listId: string,
  input: BookmarkInput,
) {
  await assertRole(userId, listId, "COLLABORATOR");
  await assertListUnlocked(listId);

  const list = await prisma.list.findUnique({
    where: { id: listId },
    select: { ownerId: true },
  });
  if (!list) throw new Error("List not found.");
  if (list.ownerId === userId) await assertCanCreateBookmark(userId, 1);

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

  // Must be allowed to add to each existing list, and the list must not be locked.
  // Rejecting rather than quietly dropping a locked target: same reasoning as
  // `createBookmark` above (a write into a locked list sits outside the cap count
  // forever), and a silent skip would report a successful multi-list save that did
  // not actually happen everywhere the user asked for.
  for (const listId of existing) {
    await assertRole(userId, listId, "COLLABORATOR");
    await assertListUnlocked(listId);
  }

  // Free-tier capacity, checked once against everything this call would add to the
  // caller's own capacity, before any write. One check per list would let a free
  // user with 19 bookmarks slip three more in with a single multi-list create.
  //
  // Owned targets are the existing target lists whose owner is the caller, plus
  // every list being created inline here (those are always owned by their creator).
  // Copies landing in lists owned by someone else are collaboration and are left
  // out of the count entirely, so they never consume the adder's quota. When no
  // target is the caller's own, both guards are skipped rather than called with 0,
  // so a user already over the cap can still contribute to other people's lists.
  if (newNames.length > 0) await assertCanCreateList(userId, newNames.length);
  const ownedTargetCount =
    (await countOwnedLists(userId, existing)) + newNames.length;
  if (ownedTargetCount > 0) await assertCanCreateBookmark(userId, ownedTargetCount);

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

/**
 * Build a shareable snapshot from a bookmark the acting user can view. Reads through
 * `getBookmarkForUser`, which enforces the sender's access to the source list (returns
 * null → throws here). Tags come across by name only (they're recreated as the saver's
 * own on save). Omits rating/visited — those are personal and reset on save.
 */
export async function buildBookmarkSnapshot(
  userId: string,
  bookmarkId: string,
): Promise<SharedBookmarkSnapshot> {
  const result = await getBookmarkForUser(userId, bookmarkId);
  if (!result) throw new Error("Bookmark not found.");
  const b = result.bookmark;
  return {
    name: b.name,
    description: b.description,
    urls: b.urls,
    images: b.images,
    notes: b.notes,
    location: b.location,
    latitude: b.latitude,
    longitude: b.longitude,
    videoUrl: b.videoUrl,
    videoType: b.videoType,
    tagNames: b.tags.map((bt) => bt.tag.name),
  };
}

/**
 * Turn a shared snapshot into a `BookmarkInput` for the copy the recipient saves. The
 * personal fields `rating`/`visited` are reset to their defaults here — this is the single
 * place that reset lives.
 */
export function snapshotToInput(s: SharedBookmarkSnapshot): BookmarkInput {
  return { ...s, rating: 0, visited: false };
}

/**
 * Save a bookmark shared over DM into the recipient's own lists. Reloads the snapshot
 * server-side from the message (never trusts a client-supplied copy) after verifying the
 * message is a BOOKMARK share and the caller is a participant of its conversation, then
 * reuses `createBookmarkInLists` to write one independent copy per target list.
 */
export async function saveSharedBookmark(
  userId: string,
  messageId: string,
  existingListIds: string[],
  newListNames: string[],
  newListsPublic = false,
) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { type: true, sharedBookmark: true, conversationId: true },
  });
  if (!message || message.type !== "BOOKMARK" || !message.sharedBookmark) {
    throw new Error("Shared bookmark not found.");
  }

  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId: message.conversationId, userId } },
    select: { id: true },
  });
  if (!participant) throw new Error("Shared bookmark not found.");

  const snapshot = message.sharedBookmark as unknown as SharedBookmarkSnapshot;
  return createBookmarkInLists(
    userId,
    existingListIds,
    newListNames,
    snapshotToInput(snapshot),
    newListsPublic,
  );
}

/** Edit a bookmark — requires COLLABORATOR. Returns its list. */
export async function updateBookmark(
  userId: string,
  bookmarkId: string,
  input: BookmarkInput,
) {
  const listId = await listIdOfWritableBookmark(bookmarkId);
  await assertRole(userId, listId, "COLLABORATOR");

  await prisma.bookmark.update({
    where: { id: bookmarkId },
    data: normalizeFields(input),
  });
  await syncBookmarkTags(bookmarkId, userId, normalizeTagNames(input.tagNames), listId);
  return { listId };
}

/**
 * Delete a bookmark — requires COLLABORATOR. Returns its list.
 *
 * Deliberately allowed on a locked bookmark (and inside a locked list): deleting is
 * the self-service way back under the free cap for a lapsed over-cap user.
 */
export async function deleteBookmark(userId: string, bookmarkId: string) {
  const listId = await listIdOfBookmark(bookmarkId);
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

/** Set the 0–5 rating (clamped) — requires COLLABORATOR. Returns its list. */
export async function setRating(
  userId: string,
  bookmarkId: string,
  rating: number,
) {
  const bookmark = await prisma.bookmark.findUnique({
    where: { id: bookmarkId },
    select: { listId: true },
  });
  if (!bookmark) throw new Error("Bookmark not found.");
  await assertRole(userId, bookmark.listId, "COLLABORATOR");

  const clamped = Number.isFinite(rating)
    ? Math.min(5, Math.max(0, Math.round(rating * 2) / 2)) // snap to half-steps
    : 0;
  await prisma.bookmark.update({
    where: { id: bookmarkId },
    data: { rating: clamped },
  });
  return { listId: bookmark.listId };
}

/**
 * Duplicate a list into a brand-new list owned by the acting user — requires
 * membership (VIEWER+) on the source. The copy is fully independent: only the
 * bookmarks (with their tags) are cloned. Members, invites, polls, and comments
 * are NOT carried over, and the new list is private. Each cloned bookmark is its
 * own row, so later edits/deletes on either list never affect the other. Tags are
 * re-created as the acting user's own tags (fresh per-list colors). Returns the
 * new list.
 *
 * Counts against both free caps: the copy is a new list the caller owns, holding a
 * new owned bookmark per source bookmark. Without that, duplicating someone's
 * 50-bookmark list would blow straight past both limits in one call.
 */
export async function duplicateList(
  userId: string,
  sourceListId: string,
  newName: string,
) {
  await assertRole(userId, sourceListId, "VIEWER");

  const source = await prisma.list.findUnique({
    where: { id: sourceListId },
    select: {
      name: true,
      bookmarks: {
        select: {
          name: true,
          description: true,
          urls: true,
          images: true,
          notes: true,
          location: true,
          latitude: true,
          longitude: true,
          rating: true,
          visited: true,
          videoUrl: true,
          videoType: true,
          tags: { select: { tag: { select: { name: true } } } },
        },
      },
    },
  });
  if (!source) throw new Error("List not found.");

  // Free-tier capacity, checked against everything this call would add before any
  // write: exactly one new owned list, plus one new owned bookmark per source
  // bookmark. Both guards no-op for pro. The bookmark guard is skipped for an empty
  // source rather than called with 0, so a user already over the cap can still
  // duplicate an empty list. Either guard's FreeLimitError propagates untouched, the
  // same as in createList/createBookmark, so the paywall can branch on it.
  await assertCanCreateList(userId, 1);
  if (source.bookmarks.length > 0) {
    await assertCanCreateBookmark(userId, source.bookmarks.length);
  }

  const name =
    newName.trim().slice(0, LIST_NAME_MAX) ||
    `Copy of ${source.name}`.slice(0, LIST_NAME_MAX);

  const newList = await createListRecord(userId, { name, isPublic: false });

  for (const b of source.bookmarks) {
    const { tags, ...fields } = b;
    const bookmark = await prisma.bookmark.create({
      data: { ...fields, listId: newList.id },
    });
    const tagNames = normalizeTagNames(tags.map((bt) => bt.tag.name));
    await syncBookmarkTags(bookmark.id, userId, tagNames, newList.id);
  }

  return newList;
}

/** Delete every bookmark in a list (cascades tags/comments/poll options) — owner only. */
export async function clearListBookmarks(userId: string, listId: string) {
  await assertRole(userId, listId, "OWNER");
  await prisma.bookmark.deleteMany({ where: { listId } });
  return { listId };
}
