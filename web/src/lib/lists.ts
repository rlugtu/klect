import "server-only";
import { prisma } from "@/lib/db";
import { getViewerAccess } from "@/lib/permissions";

const NAME_MAX = 30;

/**
 * Create a list owned by `userId` (with an OWNER membership at the end of their
 * ordering) and return it. Shared by the list-create action and the multi-list
 * bookmark-create flow. Does NOT revalidate/redirect — the caller handles that.
 */
export function createListRecord(
  userId: string,
  {
    name,
    description = "",
    icon,
    isPublic = false,
  }: { name: string; description?: string; icon?: string; isPublic?: boolean },
) {
  const trimmed = name.trim().slice(0, NAME_MAX);
  if (!trimmed) throw new Error("List name is required.");

  return prisma.$transaction(async (tx) => {
    const position = await tx.listMembership.count({ where: { userId } });
    return tx.list.create({
      data: {
        name: trimmed,
        description: description.trim(),
        icon: icon?.trim() || "📁",
        isPublic,
        ownerId: userId,
        memberships: { create: { userId, role: "OWNER", position } },
      },
    });
  });
}

/** All lists the user participates in, in their personal order. */
export function getUserLists(userId: string) {
  return prisma.listMembership.findMany({
    where: { userId },
    orderBy: { position: "asc" },
    include: {
      list: {
        include: {
          _count: { select: { bookmarks: true, memberships: true } },
        },
      },
    },
  });
}

const listDetailInclude = {
  owner: { select: { id: true, handle: true, icon: true } },
  _count: { select: { bookmarks: true, memberships: true } },
} as const;

/** A single list plus the user's membership (role), or null if no access. */
export function getListForUser(userId: string, listId: string) {
  return prisma.listMembership.findUnique({
    where: { listId_userId: { listId, userId } },
    include: { list: { include: listDetailInclude } },
  });
}

/**
 * A single list the user can READ — as a member (their role) or as a guest of a
 * public list (`role: "VIEWER"`, `isMember: false`). Returns null with no access.
 * Same `list` shape as {@link getListForUser}; used by read-only public views.
 */
export async function getListForViewer(userId: string, listId: string) {
  const access = await getViewerAccess(userId, listId);
  if (!access) return null;
  const list = await prisma.list.findUnique({
    where: { id: listId },
    include: listDetailInclude,
  });
  if (!list) return null;
  return { list, role: access.role, isMember: access.isMember };
}
