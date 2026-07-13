import "server-only";
import { prisma } from "@/lib/db";
import { type Role } from "@/generated/prisma/enums";

const RANK: Record<Role, number> = {
  VIEWER: 1,
  COLLABORATOR: 2,
  OWNER: 3,
};

export function roleAtLeast(role: Role, min: Role): boolean {
  return RANK[role] >= RANK[min];
}

/** The current user's membership for a list, or null if they have no access. */
export function getMembership(userId: string, listId: string) {
  return prisma.listMembership.findUnique({
    where: { listId_userId: { listId, userId } },
  });
}

/**
 * Assert the user has at least `min` role on the list. Returns the membership.
 * Throws if the user is not a member or lacks the required role — call from
 * server actions so unauthorized mutations fail loudly.
 */
export async function assertRole(userId: string, listId: string, min: Role) {
  const membership = await getMembership(userId, listId);
  if (!membership || !roleAtLeast(membership.role, min)) {
    throw new Error("You don't have permission to do that.");
  }
  return membership;
}

/**
 * Read access for a list: the user's membership role, or a guest VIEWER role
 * when the list is public. Non-members of a public list get `role: "VIEWER"`
 * and `isMember: false` — enough to READ; every mutation still goes through
 * `assertRole`, which requires a real membership. Returns null with no access.
 */
export async function getViewerAccess(
  userId: string,
  listId: string,
): Promise<{ role: Role; isMember: boolean } | null> {
  const membership = await getMembership(userId, listId);
  if (membership) return { role: membership.role, isMember: true };
  const list = await prisma.list.findUnique({
    where: { id: listId },
    select: { isPublic: true },
  });
  if (list?.isPublic) return { role: "VIEWER", isMember: false };
  return null;
}

/** Throw unless the user can at least READ the list (member or public). */
export async function assertCanView(userId: string, listId: string) {
  const access = await getViewerAccess(userId, listId);
  if (!access) throw new Error("You don't have permission to do that.");
  return access;
}
