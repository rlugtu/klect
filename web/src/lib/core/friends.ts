import "server-only";
import { prisma } from "@/lib/db";
import { areFriends } from "@/lib/friends";
import { isBlockedEitherWay } from "@/lib/blocks";
import { sendPushToUsers } from "@/lib/core/push";

export type FriendState = { error?: string; success?: string };

/**
 * Create a PENDING friend request from `requesterId` to `targetUserId` unless the two
 * are already linked in either direction. Idempotent; returns whether a row was created.
 * Shared by the email flow below and the "add as friend too?" list-invite prompt.
 */
export async function sendFriendRequestById(
  requesterId: string,
  targetUserId: string,
) {
  if (requesterId === targetUserId) return false;
  if (await isBlockedEitherWay(requesterId, targetUserId)) return false;
  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId, addresseeId: targetUserId },
        { requesterId: targetUserId, addresseeId: requesterId },
      ],
    },
    select: { id: true },
  });
  if (existing) return false;
  await prisma.friendship.create({
    data: { requesterId, addresseeId: targetUserId },
  });

  const requester = await prisma.user.findUnique({
    where: { id: requesterId },
    select: { handle: true },
  });
  await sendPushToUsers([targetUserId], "friends", {
    title: "New friend request",
    body: `@${requester?.handle ?? "Someone"} wants to be friends`,
    data: { route: "/friend-requests" },
  });

  return true;
}

/** Send a friend request by @handle (Friends page "add friend" form). */
export async function sendFriendRequest(
  userId: string,
  handleInput: string,
): Promise<FriendState> {
  const handle = handleInput.trim().toLowerCase().replace(/^@/, "");
  if (!handle) return { error: "Handle is required." };
  const target = await prisma.user.findUnique({ where: { handle } });
  if (!target) return { error: "No Klect user with that handle." };
  if (target.id === userId) return { error: "You can't add yourself." };
  if (await areFriends(userId, target.id)) {
    return { success: `You're already friends with @${handle}.` };
  }
  const created = await sendFriendRequestById(userId, target.id);
  return created
    ? { success: `Friend request sent to @${handle}.` }
    : { success: `A request with @${handle} is already pending.` };
}

/** Accept a friend request addressed to the current user. */
export async function acceptFriendRequest(userId: string, friendshipId: string) {
  const req = await prisma.friendship.findUnique({ where: { id: friendshipId } });
  if (!req || req.addresseeId !== userId) {
    throw new Error("Friend request not found.");
  }
  await prisma.friendship.update({
    where: { id: friendshipId },
    data: { status: "ACCEPTED" },
  });

  const accepter = await prisma.user.findUnique({
    where: { id: userId },
    select: { handle: true },
  });
  await sendPushToUsers([req.requesterId], "friends", {
    title: "Friend request accepted",
    body: `@${accepter?.handle ?? "Someone"} accepted your friend request`,
    data: { route: "/friends" },
  });
}

/** Decline a friend request addressed to the current user (deletes the row). */
export async function declineFriendRequest(userId: string, friendshipId: string) {
  const req = await prisma.friendship.findUnique({ where: { id: friendshipId } });
  if (!req || req.addresseeId !== userId) {
    throw new Error("Friend request not found.");
  }
  await prisma.friendship.delete({ where: { id: friendshipId } });
}

/** Cancel a pending friend request the current user sent (deletes the row). */
export async function cancelFriendRequest(userId: string, friendshipId: string) {
  const req = await prisma.friendship.findUnique({ where: { id: friendshipId } });
  if (!req || req.requesterId !== userId || req.status !== "PENDING") {
    throw new Error("Friend request not found.");
  }
  await prisma.friendship.delete({ where: { id: friendshipId } });
}

/** Remove a friend — either party may. No-op if the user isn't part of it. */
export async function removeFriend(userId: string, friendshipId: string) {
  const req = await prisma.friendship.findUnique({ where: { id: friendshipId } });
  if (!req) return;
  if (req.requesterId !== userId && req.addresseeId !== userId) {
    throw new Error("You can't remove that friend.");
  }
  await prisma.friendship.delete({ where: { id: friendshipId } });
}
