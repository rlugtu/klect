import "server-only";
import { prisma } from "@/lib/db";
import { getMembership } from "@/lib/permissions";

const creatorSelect = {
  creator: { select: { id: true, handle: true, icon: true } },
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
              user: { select: { id: true, handle: true, icon: true } },
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

  // Anonymous polls hide *who* voted from everyone (counts stay). Strip voter
  // identity from the payload so the wire never carries who-voted-what — done
  // after myOptionIds is derived above (which needs the real userIds).
  if (poll.isAnonymous) {
    for (const o of poll.options) {
      o.votes = o.votes.map((v) => ({
        ...v,
        userId: "",
        user: { id: "", handle: null, icon: null },
      }));
    }
  }

  return { ...poll, role: membership.role, myOptionIds, remainingVotes };
}
