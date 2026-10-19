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
import { BULK_BOOKMARK_MAX, planBookmarkMove, uniqueIds } from "@/lib/move-plan";

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

/**
 * Delete several bookmarks at once. The bulk form of {@link deleteBookmark}, with
 * the same rules per item: COLLABORATOR on the list each bookmark lives in, and
 * allowed on locked bookmarks and inside locked lists (deleting is how an over-cap
 * user trims back under the cap).
 *
 * All or nothing: every id must exist and every role check must pass before any
 * row is deleted, and the deletes run in one transaction. Cascades are the same
 * as a single delete (tag links, comments, poll options and their votes).
 */
export async function deleteBookmarks(userId: string, bookmarkIds: string[]) {
  const ids = uniqueIds(bookmarkIds);
  if (ids.length === 0) throw new Error("Pick at least one bookmark to delete.");
  if (ids.length > BULK_BOOKMARK_MAX) {
    throw new Error(`You can delete up to ${BULK_BOOKMARK_MAX} bookmarks at once.`);
  }

  const rows = await prisma.bookmark.findMany({
    where: { id: { in: ids } },
    select: { id: true, listId: true },
  });
  if (rows.length !== ids.length) throw new Error("Bookmark not found.");

  const byList = new Map<string, string[]>();
  for (const r of rows) byList.set(r.listId, [...(byList.get(r.listId) ?? []), r.id]);
  for (const listId of byList.keys()) await assertRole(userId, listId, "COLLABORATOR");

  // Each delete is scoped to the list its role check passed on, so a bookmark
  // that moved in between is left alone rather than deleted from a list the
  // caller was never checked against.
  const results = await prisma.$transaction(
    [...byList].map(([listId, group]) =>
      prisma.bookmark.deleteMany({ where: { id: { in: group }, listId } }),
    ),
  );
  const deleted = results.reduce((n, r) => n + r.count, 0);
  return { deleted, listIds: [...byList.keys()] };
}

/**
 * Move bookmarks into another list, keeping each bookmark's identity. The bulk
 * form; {@link moveBookmark} is the one-item wrapper.
 *
 * A true re-parent (`Bookmark.listId` changes), not copy plus delete: the id,
 * comments, images, rating, visited flag, notes, location, video, and every tag
 * link survive, so links to the bookmark, DM shares that point back at it, and
 * the comment thread all keep working.
 *
 * Rules (the pure decision is `planBookmarkMove` in lib/move-plan.ts):
 * - COLLABORATOR or higher on the destination and on every source list.
 * - Neither side locked: not the destination, not a source list, not the
 *   bookmark itself (a move is an edit-style write; see {@link LockedError}).
 * - Free cap: a move counts against the caller's bookmark cap only for bookmarks
 *   leaving a list someone else owns and landing in one the caller owns. Moves
 *   between the caller's own lists are net zero, and moves into someone else's
 *   list follow `createBookmark` (collaboration is never capped for the adder).
 *   Without this, "save into a friend's list, then drag it home" would be an
 *   uncapped way to own bookmarks.
 * - Bookmarks already in the destination are skipped, not an error.
 *
 * Tags: every `BookmarkTag` link is kept as is. Tags are user-scoped labels on
 * the bookmark (each link points at one user's `Tag` row), and every member of a
 * list already sees all of a bookmark's tags, whoever added them. So when the
 * destination is shared with other people, the bookmark arrives carrying the
 * same pills it had, including tags owned by members of the source list who are
 * not members of the destination. Those links stay inert for their owners: tag
 * search (`getBookmarksByTags`) is membership-scoped, so it never surfaces the
 * bookmark to someone without access, and any destination collaborator can still
 * strip a tag by name with `removeTagFromList`. No `Tag` rows are created or
 * deleted, and moving back restores the bookmark exactly.
 *
 * Polls: poll options are dropped (with their votes). A poll belongs to the
 * source list, and keeping an option that points into another list would show
 * that list's bookmark to people who may not be able to see it. Same outcome a
 * delete has for those polls.
 *
 * The writes run in one interactive transaction: options removed, then each
 * source group updated with a `listId` + unlocked guard. If any row no longer
 * matches (moved or locked by a concurrent request) the whole move rolls back.
 */
export async function moveBookmarks(
  userId: string,
  bookmarkIds: string[],
  targetListId: string,
) {
  await assertRole(userId, targetListId, "COLLABORATOR");
  const target = await prisma.list.findUnique({
    where: { id: targetListId },
    select: { id: true, ownerId: true, lockedAt: true },
  });
  if (!target) throw new Error("List not found.");

  const ids = uniqueIds(bookmarkIds);
  const rows = ids.length
    ? await prisma.bookmark.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          listId: true,
          lockedAt: true,
          list: { select: { ownerId: true, lockedAt: true } },
        },
      })
    : [];

  // Role on every source before anything else is revealed about the rows (a
  // locked-state message would otherwise leak that a bookmark exists).
  for (const listId of new Set(rows.map((r) => r.listId))) {
    await assertRole(userId, listId, "COLLABORATOR");
  }

  const plan = planBookmarkMove(
    userId,
    ids,
    rows.map((r) => ({
      id: r.id,
      listId: r.listId,
      locked: r.lockedAt !== null,
      listLocked: r.list.lockedAt !== null,
      listOwnerId: r.list.ownerId,
    })),
    { id: target.id, ownerId: target.ownerId, locked: target.lockedAt !== null },
  );

  if (!plan.ok) {
    switch (plan.reason) {
      case "empty":
        throw new Error("Pick at least one bookmark to move.");
      case "too-many":
        throw new Error(`You can move up to ${BULK_BOOKMARK_MAX} bookmarks at once.`);
      case "not-found":
        throw new Error("Bookmark not found.");
      case "target-locked":
      case "source-locked":
        throw new LockedError("list");
      case "bookmark-locked":
        throw new LockedError("bookmark");
    }
  }

  const sourceListIds = Object.keys(plan.bySource);
  if (plan.moveIds.length === 0) {
    return {
      listId: targetListId,
      moved: 0,
      skipped: plan.alreadyThere.length,
      sourceListIds,
      bySource: plan.bySource,
    };
  }

  if (plan.ownedIncoming > 0) await assertCanCreateBookmark(userId, plan.ownedIncoming);

  await prisma.$transaction(async (tx) => {
    const fresh = await tx.list.findUnique({
      where: { id: targetListId },
      select: { lockedAt: true },
    });
    if (!fresh) throw new Error("List not found.");
    if (fresh.lockedAt) throw new LockedError("list");

    await tx.pollOption.deleteMany({ where: { bookmarkId: { in: plan.moveIds } } });

    let moved = 0;
    for (const [sourceId, group] of Object.entries(plan.bySource)) {
      const { count } = await tx.bookmark.updateMany({
        where: {
          id: { in: group },
          listId: sourceId,
          lockedAt: null,
          list: { lockedAt: null },
        },
        data: { listId: targetListId },
      });
      moved += count;
    }
    if (moved !== plan.moveIds.length) {
      throw new Error("Some bookmarks changed while moving, so nothing was moved. Try again.");
    }
  });

  return {
    listId: targetListId,
    moved: plan.moveIds.length,
    skipped: plan.alreadyThere.length,
    sourceListIds,
    // Which ids came from which list, so a client can offer an undo that
    // moves each group back (through this same function and its rules).
    bySource: plan.bySource,
  };
}

/** Move one bookmark into another list. See {@link moveBookmarks} for every rule. */
export function moveBookmark(userId: string, bookmarkId: string, targetListId: string) {
  return moveBookmarks(userId, [bookmarkId], targetListId);
}

/**
 * Copy bookmarks into another list as independent rows (desktop "Copy to
 * list"). Each copy is written by {@link createBookmarkInLists}, the same path
 * `/bookmarks/new` uses to put one bookmark into several lists, so the
 * destination rules are exactly that path's: COLLABORATOR on the destination,
 * destination not locked, and the free bookmark cap only when the destination
 * is a list the caller owns.
 *
 * Source rules: membership (VIEWER or higher) on every source list, the same
 * bar as `duplicateList`, and no locked source bookmark or list (locked content
 * stays where the downgrade selection put it, as with a move). Like
 * `duplicateList` the copy keeps name, description, links, photos, notes,
 * location, video, rating, visited and tags (tags are recreated as the
 * caller's own); comments and poll entries stay with the original.
 *
 * All checks, including the cap for the whole batch, run before the first
 * write, so a refusal writes nothing. The writes themselves are one
 * `createBookmarkInLists` call per bookmark (not one transaction), as that path
 * is today. Returns how many copies were made.
 */
export async function copyBookmarksToList(
  userId: string,
  bookmarkIds: string[],
  targetListId: string,
) {
  const ids = uniqueIds(bookmarkIds);
  if (ids.length === 0) throw new Error("Pick at least one bookmark to copy.");
  if (ids.length > BULK_BOOKMARK_MAX) {
    throw new Error(`You can copy up to ${BULK_BOOKMARK_MAX} bookmarks at once.`);
  }

  await assertRole(userId, targetListId, "COLLABORATOR");
  await assertListUnlocked(targetListId);
  const target = await prisma.list.findUnique({
    where: { id: targetListId },
    select: { ownerId: true },
  });
  if (!target) throw new Error("List not found.");

  const rows = await prisma.bookmark.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      listId: true,
      lockedAt: true,
      list: { select: { lockedAt: true } },
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
  });
  if (rows.length !== ids.length) throw new Error("Bookmark not found.");

  // Membership on every source before anything else is revealed about the rows.
  for (const listId of new Set(rows.map((r) => r.listId))) {
    await assertRole(userId, listId, "VIEWER");
  }
  if (rows.some((r) => r.list.lockedAt !== null)) throw new LockedError("list");
  if (rows.some((r) => r.lockedAt !== null)) throw new LockedError("bookmark");

  // One cap check for the whole batch (per-copy checks alone would let a
  // batch stop halfway at the limit).
  if (target.ownerId === userId) await assertCanCreateBookmark(userId, rows.length);

  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const id of ids) {
    const r = byId.get(id)!;
    await createBookmarkInLists(userId, [targetListId], [], {
      name: r.name,
      description: r.description,
      urls: r.urls,
      images: r.images,
      notes: r.notes,
      location: r.location,
      latitude: r.latitude,
      longitude: r.longitude,
      rating: r.rating,
      visited: r.visited,
      videoUrl: r.videoUrl,
      videoType: r.videoType,
      tagNames: r.tags.map((t) => t.tag.name),
    });
  }
  return { listId: targetListId, copied: ids.length };
}

/**
 * Mark several bookmarks visited or unvisited (desktop bulk bar). Sets the flag
 * rather than toggling it, so a mixed selection ends up uniform. Same role rule
 * as {@link toggleVisited} (COLLABORATOR on each bookmark's list); locked
 * bookmarks and bookmarks in locked lists are refused, since a locked row is
 * read-only. All or nothing in one transaction, each update scoped to the list
 * its role check passed on and to unlocked rows, so a concurrent move or lock
 * rolls the whole change back.
 */
export async function setVisitedMany(
  userId: string,
  bookmarkIds: string[],
  visited: boolean,
) {
  const ids = uniqueIds(bookmarkIds);
  if (ids.length === 0) throw new Error("Pick at least one bookmark.");
  if (ids.length > BULK_BOOKMARK_MAX) {
    throw new Error(`You can update up to ${BULK_BOOKMARK_MAX} bookmarks at once.`);
  }

  const rows = await prisma.bookmark.findMany({
    where: { id: { in: ids } },
    select: { id: true, listId: true, lockedAt: true, list: { select: { lockedAt: true } } },
  });
  if (rows.length !== ids.length) throw new Error("Bookmark not found.");

  const byList = new Map<string, string[]>();
  for (const r of rows) byList.set(r.listId, [...(byList.get(r.listId) ?? []), r.id]);
  for (const listId of byList.keys()) await assertRole(userId, listId, "COLLABORATOR");
  if (rows.some((r) => r.list.lockedAt !== null)) throw new LockedError("list");
  if (rows.some((r) => r.lockedAt !== null)) throw new LockedError("bookmark");

  await prisma.$transaction(async (tx) => {
    let updated = 0;
    for (const [listId, group] of byList) {
      const { count } = await tx.bookmark.updateMany({
        where: { id: { in: group }, listId, lockedAt: null, list: { lockedAt: null } },
        data: { visited },
      });
      updated += count;
    }
    if (updated !== ids.length) {
      throw new Error("Some bookmarks changed while saving, so nothing was changed. Try again.");
    }
  });
  return { updated: ids.length, listIds: [...byList.keys()] };
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
