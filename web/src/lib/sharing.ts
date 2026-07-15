import "server-only";
import { prisma } from "@/lib/db";

/** Members of a list with their user info (owner first). */
export async function getListMembers(listId: string) {
  const members = await prisma.listMembership.findMany({
    where: { listId },
    orderBy: { createdAt: "asc" },
    include: {
      user: {
        select: { id: true, handle: true, icon: true },
      },
    },
  });
  // Owner first, then by join time.
  return members.sort((a, b) =>
    a.role === "OWNER" ? -1 : b.role === "OWNER" ? 1 : 0,
  );
}

/** Pending (not-yet-decided) join requests for a list, each with the invited
 *  user's @handle (invites target existing users, keyed internally by email). */
export async function getPendingInvites(listId: string) {
  const invites = await prisma.listInvite.findMany({
    where: { listId, status: "PENDING" },
    orderBy: { createdAt: "asc" },
  });
  if (invites.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { email: { in: invites.map((i) => i.email) } },
    select: { email: true, handle: true },
  });
  const handleByEmail = new Map(users.map((u) => [u.email, u.handle]));
  return invites.map((inv) => ({
    ...inv,
    handle: handleByEmail.get(inv.email) ?? null,
  }));
}

/**
 * Pending list-join requests addressed to this email — the incoming "collab requests"
 * shown on the home page. Newest first; includes list + inviter context.
 */
export function getIncomingRequests(email: string) {
  return prisma.listInvite.findMany({
    where: { email: email.toLowerCase(), status: "PENDING" },
    orderBy: { createdAt: "desc" },
    include: {
      list: { select: { id: true, name: true, description: true, icon: true } },
      invitedBy: { select: { handle: true } },
    },
  });
}

/** An invite by its token, with list + inviter context (for the accept page). */
export function getInviteByToken(token: string) {
  return prisma.listInvite.findUnique({
    where: { token },
    include: {
      list: { select: { id: true, name: true, icon: true, description: true } },
      invitedBy: { select: { handle: true } },
    },
  });
}
