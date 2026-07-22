import "server-only";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { isBlockedEitherWay } from "@/lib/blocks";

type ProfileList = Prisma.ListGetPayload<{
  include: { _count: { select: { bookmarks: true; memberships: true } } };
}>;

export type FriendshipState = "self" | "none" | "pending" | "friends" | "blocked";

/**
 * A user's public profile: identity fields, their PUBLIC lists (owned + public),
 * a friend count, and the viewer↔target relationship (drives the Add-friend
 * button on other people's profiles). Read-only; safe to expose to any signed-in
 * user. Resolved by `@handle` OR user id, so both handle- and id-based profile
 * links work. Returns null if no such user.
 */
export async function getPublicProfile(viewerId: string, handleOrId: string) {
  const user = await prisma.user.findFirst({
    where: { OR: [{ handle: handleOrId }, { id: handleOrId }] },
    select: {
      id: true,
      handle: true,
      icon: true,
      image: true,
      createdAt: true,
    },
  });
  if (!user) return null;

  const targetUserId = user.id;

  // A full block hides the two users from each other: no lists, no friend state — just an
  // Unblock affordance for the blocker. `blockedByMe` lets the client show Block vs Unblock.
  const blocked =
    viewerId !== targetUserId &&
    (await isBlockedEitherWay(viewerId, targetUserId));
  if (blocked) {
    const blockedByMe =
      (await prisma.block.findFirst({
        where: { blockerId: viewerId, blockedId: targetUserId },
        select: { id: true },
      })) !== null;
    return {
      user,
      publicLists: [] as ProfileList[],
      friendCount: 0,
      friendship: "blocked" as FriendshipState,
      blockedByMe,
    };
  }

  const [publicLists, friendCount, friendship] = await Promise.all([
    prisma.list.findMany({
      where: { ownerId: targetUserId, isPublic: true },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { bookmarks: true, memberships: true } } },
    }),
    prisma.friendship.count({
      where: {
        status: "ACCEPTED",
        OR: [{ requesterId: targetUserId }, { addresseeId: targetUserId }],
      },
    }),
    resolveFriendship(viewerId, targetUserId),
  ]);

  return { user, publicLists, friendCount, friendship, blockedByMe: false };
}

/** The viewer↔target relationship state, for the profile action button. */
async function resolveFriendship(
  viewerId: string,
  targetUserId: string,
): Promise<FriendshipState> {
  if (viewerId === targetUserId) return "self";
  const row = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: viewerId, addresseeId: targetUserId },
        { requesterId: targetUserId, addresseeId: viewerId },
      ],
    },
    select: { status: true },
  });
  if (!row) return "none";
  return row.status === "ACCEPTED" ? "friends" : "pending";
}
