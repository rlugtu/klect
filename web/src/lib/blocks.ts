import "server-only";
import { prisma } from "@/lib/db";

const blockedUserSelect = {
  id: true,
  handle: true,
  icon: true,
  image: true,
} as const;

/**
 * Whether either user has blocked the other. "Full block" is symmetric everywhere it's
 * enforced — one block row (in either direction) is enough to sever DMs, friend requests,
 * profile visibility, and content reads between the two. Mirrors `areFriends` in shape.
 */
export async function isBlockedEitherWay(userId: string, otherUserId: string) {
  if (userId === otherUserId) return false;
  const row = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: userId, blockedId: otherUserId },
        { blockerId: otherUserId, blockedId: userId },
      ],
    },
    select: { id: true },
  });
  return row !== null;
}

/**
 * The set of user ids to hide from `userId`: everyone they've blocked plus everyone who
 * has blocked them. Used to filter authored content (comments, chat, DM threads) out of
 * read paths so a full block is mutual and content-level, not just interpersonal.
 */
export async function getBlockedUserIds(userId: string): Promise<string[]> {
  const rows = await prisma.block.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });
  const ids = new Set<string>();
  for (const r of rows) {
    ids.add(r.blockerId === userId ? r.blockedId : r.blockerId);
  }
  return [...ids];
}

/** Users `userId` has blocked (newest first), for the Blocked-users management screen. */
export async function getBlockedUsers(userId: string) {
  const rows = await prisma.block.findMany({
    where: { blockerId: userId },
    orderBy: { createdAt: "desc" },
    include: { blocked: { select: blockedUserSelect } },
  });
  return rows.map((r) => ({ blockId: r.id, user: r.blocked }));
}
