import "server-only";
import { prisma } from "@/lib/db";
import { getViewerAccess } from "@/lib/permissions";
import { getListMembers } from "@/lib/sharing";
import { getBlockedUserIds } from "@/lib/blocks";
import { type Role } from "@/generated/prisma/enums";

const DEFAULT_PAGE = 25;

export type ChatMessagesPage = Awaited<ReturnType<typeof getChatMessages>>;
export type ChatMessage = ChatMessagesPage["messages"][number];

/**
 * A page of a list's chatroom, oldest→newest for display, plus a `nextCursor` for loading
 * older history. Keyset pagination on (createdAt desc, id) keeps every page a cheap indexed
 * read regardless of history length. Each message carries its sender's public identity and
 * their role in the list (so the UI can show a soft "· collaborator" suffix). `canSend` is
 * true for members only. Throws if the caller can't even read the list.
 */
export async function getChatMessages(
  userId: string,
  listId: string,
  cursor?: string,
  limit: number = DEFAULT_PAGE,
) {
  const access = await getViewerAccess(userId, listId);
  if (!access) throw new Error("List not found.");

  // Members are the chatroom participants; also gives us handle/icon + role per sender.
  const members = await getListMembers(listId);
  const byId = new Map(
    members.map((m) => [m.userId, { user: m.user, role: m.role as Role }]),
  );

  // Hide chat messages authored by anyone the viewer has blocked or been blocked by.
  const blocked = await getBlockedUserIds(userId);
  const rows = await prisma.listChatMessage.findMany({
    where: { listId, senderId: { notIn: blocked } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: { id: true, body: true, createdAt: true, senderId: true },
  });

  let nextCursor: string | null = null;
  if (rows.length > limit) {
    nextCursor = rows[limit - 1].id; // last row of this page → cursor for the next (older) page
    rows.length = limit;
  }

  const messages = rows.reverse().map((m) => {
    const member = byId.get(m.senderId);
    return {
      ...m,
      sender: member?.user ?? null, // null if the sender has since left the list
      role: member?.role ?? null,
    };
  });

  return { messages, nextCursor, canSend: access.isMember };
}

/** Number of chat messages from other members newer than the user's read mark. */
export async function getChatUnreadCount(userId: string, listId: string) {
  const membership = await prisma.listMembership.findUnique({
    where: { listId_userId: { listId, userId } },
    select: { chatLastReadAt: true },
  });
  if (!membership) return 0; // non-members have no chat
  return prisma.listChatMessage.count({
    where: {
      listId,
      senderId: { not: userId },
      ...(membership.chatLastReadAt
        ? { createdAt: { gt: membership.chatLastReadAt } }
        : {}),
    },
  });
}
