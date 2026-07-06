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
