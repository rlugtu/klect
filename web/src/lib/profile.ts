import "server-only";
import { prisma } from "@/lib/db";

export type FriendshipState = "self" | "none" | "pending" | "friends";

/**
 * A user's public profile: identity fields, their PUBLIC lists (owned + public),
 * a friend count, and the viewer↔target relationship (drives the Add-friend
 * button on other people's profiles). Read-only; safe to expose to any signed-in
 * user. Returns null if the target user doesn't exist.
 */
export async function getPublicProfile(viewerId: string, targetUserId: string) {
  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      displayName: true,
      name: true,
      firstName: true,
      lastName: true,
      icon: true,
      image: true,
      createdAt: true,
    },
  });
  if (!user) return null;

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

  return { user, publicLists, friendCount, friendship };
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
