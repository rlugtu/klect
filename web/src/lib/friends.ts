import "server-only";
import { prisma } from "@/lib/db";

const friendUserSelect = {
  id: true,
  handle: true,
  icon: true,
} as const;

/** Whether two users share an ACCEPTED friendship (in either direction). */
export async function areFriends(userId: string, otherUserId: string) {
  if (userId === otherUserId) return false;
  const row = await prisma.friendship.findFirst({
    where: {
      status: "ACCEPTED",
      OR: [
        { requesterId: userId, addresseeId: otherUserId },
        { requesterId: otherUserId, addresseeId: userId },
      ],
    },
    select: { id: true },
  });
  return row !== null;
}

/** The user's accepted friends (the "other side" of each friendship), newest first. */
export async function getFriends(userId: string) {
  const rows = await prisma.friendship.findMany({
    where: {
      status: "ACCEPTED",
      OR: [{ requesterId: userId }, { addresseeId: userId }],
    },
    orderBy: { createdAt: "desc" },
    include: {
      requester: { select: friendUserSelect },
      addressee: { select: friendUserSelect },
    },
  });
  return rows.map((r) => ({
    friendshipId: r.id,
    friend: r.requesterId === userId ? r.addressee : r.requester,
  }));
}

/** Pending friend requests the user has received (newest first). */
export function getIncomingFriendRequests(userId: string) {
  return prisma.friendship.findMany({
    where: { addresseeId: userId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    include: { requester: { select: friendUserSelect } },
  });
}

/** Pending friend requests the user has sent, awaiting acceptance (newest first). */
export function getOutgoingFriendRequests(userId: string) {
  return prisma.friendship.findMany({
    where: { requesterId: userId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    include: { addressee: { select: friendUserSelect } },
  });
}

/** Of the given list ids, which the friend already belongs to (used to pre-select). */
export async function getFriendListIds(friendId: string, listIds: string[]) {
  if (listIds.length === 0) return [];
  const rows = await prisma.listMembership.findMany({
    where: { userId: friendId, listId: { in: listIds } },
    select: { listId: true },
  });
  return rows.map((r) => r.listId);
}

/**
 * Bulk version: map of friendId → which of `listIds` that friend belongs to. One query,
 * used by the Friends page to pre-select each friend's "add to lists" picker.
 */
export async function getFriendsListIds(listIds: string[], friendIds: string[]) {
  const map: Record<string, string[]> = {};
  if (listIds.length === 0 || friendIds.length === 0) return map;
  const rows = await prisma.listMembership.findMany({
    where: { listId: { in: listIds }, userId: { in: friendIds } },
    select: { listId: true, userId: true },
  });
  for (const r of rows) {
    (map[r.userId] ??= []).push(r.listId);
  }
  return map;
}
