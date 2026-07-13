import "server-only";
import { prisma } from "@/lib/db";
import { assertRole, getMembership } from "@/lib/permissions";

/**
 * Poll mutations, transport-agnostic (web server action + mobile tRPC share these).
 * Permissions: create/vote via `assertRole`; edit/delete via the creator-or-owner
 * rule (mirrors `core/comments.ts.deleteComment`). Option removal and bookmark
 * deletion free spent votes automatically via schema cascades — see schema.prisma.
 */
export type PollInput = {
  name: string;
  description: string;
  startAt: Date;
  endAt: Date | null;
  maxVotes: number | null; // null = unlimited votes per participant
  revotesAllowed: boolean;
  isAnonymous?: boolean; // set only at creation — updatePoll never changes it
  bookmarkIds: string[]; // options; must be bookmarks in the poll's list
};

function normalizePollFields(input: PollInput) {
  const name = input.name.trim();
  if (!name) throw new Error("Poll name is required.");
  if (input.endAt && input.endAt <= input.startAt) {
    throw new Error("Poll end time must be after the start time.");
  }
  const maxVotes =
    input.maxVotes != null && Number.isFinite(input.maxVotes)
      ? Math.max(1, Math.round(input.maxVotes))
      : null;
  return {
    name,
    description: input.description.trim(),
    startAt: input.startAt,
    endAt: input.endAt,
    maxVotes,
    revotesAllowed: input.revotesAllowed,
  };
}

/** Dedup option bookmark ids and assert they all belong to `listId` (>= 2). */
async function validOptionBookmarkIds(listId: string, bookmarkIds: string[]) {
  const ids = [...new Set(bookmarkIds.filter(Boolean))];
  if (ids.length < 2) throw new Error("Pick at least two bookmarks for the poll.");
  const found = await prisma.bookmark.findMany({
    where: { id: { in: ids }, listId },
    select: { id: true },
  });
  if (found.length !== ids.length) {
    throw new Error("Some selected bookmarks aren't in this list.");
  }
  return ids;
}

/** Poll id + list + creator, or throw. Used to gate edit/delete. */
async function loadPoll(pollId: string) {
  const poll = await prisma.poll.findUnique({
    where: { id: pollId },
    select: { id: true, listId: true, creatorId: true },
  });
  if (!poll) throw new Error("Poll not found.");
  return poll;
}

/** Allow if the acting user created the poll, or owns its list. */
async function assertCanManagePoll(
  userId: string,
  poll: { listId: string; creatorId: string },
) {
  const membership = await getMembership(userId, poll.listId);
  if (!membership) throw new Error("You don't have access to that poll.");
  const isCreator = poll.creatorId === userId;
  const isOwner = membership.role === "OWNER";
  if (!isCreator && !isOwner) throw new Error("You can't edit that poll.");
  return { listId: poll.listId };
}

/** Create a poll in a list — requires COLLABORATOR. */
export async function createPoll(userId: string, listId: string, input: PollInput) {
  await assertRole(userId, listId, "COLLABORATOR");
  const fields = normalizePollFields(input);
  const bookmarkIds = await validOptionBookmarkIds(listId, input.bookmarkIds);

  return prisma.poll.create({
    data: {
      ...fields,
      isAnonymous: input.isAnonymous ?? false,
      listId,
      creatorId: userId,
      options: { create: bookmarkIds.map((bookmarkId) => ({ bookmarkId })) },
    },
    select: { id: true, listId: true },
  });
}

/**
 * Edit a poll (creator or list owner). Reconciles options: adds newly-selected
 * bookmarks, deletes dropped ones. Deleting an option cascades its votes away,
 * so affected voters silently get that vote back (remaining votes are derived).
 */
export async function updatePoll(userId: string, pollId: string, input: PollInput) {
  const poll = await loadPoll(pollId);
  await assertCanManagePoll(userId, poll);
  const fields = normalizePollFields(input);
  const bookmarkIds = await validOptionBookmarkIds(poll.listId, input.bookmarkIds);

  const existing = await prisma.pollOption.findMany({
    where: { pollId },
    select: { id: true, bookmarkId: true },
  });
  const existingBookmarks = new Set(existing.map((o) => o.bookmarkId));
  const keep = new Set(bookmarkIds);
  const toAdd = bookmarkIds.filter((b) => !existingBookmarks.has(b));
  const toRemove = existing.filter((o) => !keep.has(o.bookmarkId)).map((o) => o.id);

  await prisma.$transaction([
    prisma.poll.update({ where: { id: pollId }, data: fields }),
    ...(toRemove.length
      ? [prisma.pollOption.deleteMany({ where: { id: { in: toRemove } } })]
      : []),
    ...(toAdd.length
      ? [
          prisma.pollOption.createMany({
            data: toAdd.map((bookmarkId) => ({ pollId, bookmarkId })),
          }),
        ]
      : []),
  ]);
  return { listId: poll.listId };
}

/** Delete a poll (creator or list owner). Cascades options + votes. */
export async function deletePoll(userId: string, pollId: string) {
  const poll = await loadPoll(pollId);
  const { listId } = await assertCanManagePoll(userId, poll);
  await prisma.poll.delete({ where: { id: pollId } });
  return { listId };
}

function isPollActive(poll: { startAt: Date; endAt: Date | null }, now = new Date()) {
  return poll.startAt <= now && (poll.endAt === null || now < poll.endAt);
}

/**
 * Replace the user's votes for a poll with `optionIds` (any member may vote).
 * Enforces: poll is open, options belong to the poll, no dups, at most `maxVotes`,
 * and — when revotes are disabled — that they haven't already voted.
 */
export async function submitVotes(
  userId: string,
  pollId: string,
  optionIds: string[],
) {
  const poll = await prisma.poll.findUnique({
    where: { id: pollId },
    select: {
      listId: true,
      startAt: true,
      endAt: true,
      maxVotes: true,
      revotesAllowed: true,
      options: { select: { id: true } },
    },
  });
  if (!poll) throw new Error("Poll not found.");
  await assertRole(userId, poll.listId, "VIEWER");

  if (!isPollActive(poll)) throw new Error("This poll isn't open for voting.");

  const ids = [...new Set(optionIds.filter(Boolean))];
  if (ids.length !== optionIds.length) throw new Error("Duplicate selection.");
  const valid = new Set(poll.options.map((o) => o.id));
  if (!ids.every((id) => valid.has(id))) {
    throw new Error("Some choices aren't part of this poll.");
  }
  if (poll.maxVotes != null && ids.length > poll.maxVotes) {
    throw new Error(`You can pick at most ${poll.maxVotes}.`);
  }

  if (!poll.revotesAllowed) {
    const existing = await prisma.pollVote.count({ where: { pollId, userId } });
    if (existing > 0) throw new Error("You've already voted; revotes aren't allowed.");
  }

  await prisma.$transaction([
    prisma.pollVote.deleteMany({ where: { pollId, userId } }),
    ...(ids.length
      ? [
          prisma.pollVote.createMany({
            data: ids.map((optionId) => ({ pollId, optionId, userId })),
          }),
        ]
      : []),
  ]);
  return { listId: poll.listId };
}
