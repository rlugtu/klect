import "server-only";
import { prisma } from "@/lib/db";
import { getMembership } from "@/lib/permissions";

const creatorSelect = {
  creator: { select: { id: true, displayName: true, name: true, icon: true } },
} as const;

/** Polls in a list, newest first, with creator + option/vote counts. */
export function getListPolls(listId: string) {
  return prisma.poll.findMany({
    where: { listId },
    orderBy: { createdAt: "desc" },
    include: {
      ...creatorSelect,
      _count: { select: { options: true, votes: true } },
    },
  });
}

/**
 * A poll with everything the detail screen needs, or `null` if the user isn't a
 * member of its list. Each option carries its bookmark (+ tags) and every vote's
 * voter (for result avatars). Also returns the caller's own selected option ids,
 * their `role`, and derived `remainingVotes` (null when the poll is unlimited).
 */
export async function getPollForUser(userId: string, pollId: string) {
  const poll = await prisma.poll.findUnique({
    where: { id: pollId },
    include: {
      ...creatorSelect,
      options: {
        orderBy: { createdAt: "asc" },
        include: {
          bookmark: {
            select: {
              id: true,
              name: true,
              images: true,
              tags: {
                include: { tag: { select: { id: true, name: true, color: true } } },
              },
            },
          },
          votes: {
            include: {
              user: { select: { id: true, displayName: true, name: true, icon: true } },
            },
          },
        },
      },
    },
  });
  if (!poll) return null;

  const membership = await getMembership(userId, poll.listId);
  if (!membership) return null;

  const myOptionIds = poll.options
    .filter((o) => o.votes.some((v) => v.userId === userId))
    .map((o) => o.id);
  const remainingVotes =
    poll.maxVotes == null ? null : Math.max(0, poll.maxVotes - myOptionIds.length);

  return { ...poll, role: membership.role, myOptionIds, remainingVotes };
}
