import "server-only";
import { prisma } from "@/lib/db";
import { assertRole, getViewerAccess } from "@/lib/permissions";
import { broadcastListChatActivity } from "@/lib/core/list-chat-realtime";
import { sendPushToListMembers } from "@/lib/core/push";

export type SendChatResult =
  | { error: string; message?: undefined }
  | {
      error?: undefined;
      message: { id: string; body: string; createdAt: Date; senderId: string };
    };

const MAX_BODY = 4000;

/**
 * Send a message to a list's chatroom. Any member (viewer+) may send; a non-member of a
 * public list cannot (writes always require membership). Bumps the sender's chat read state
 * and fires a realtime ping.
 */
export async function sendChatMessage(
  userId: string,
  listId: string,
  bodyInput: string,
): Promise<SendChatResult> {
  const body = bodyInput.trim();
  if (!body) return { error: "Message can't be empty." };
  if (body.length > MAX_BODY) return { error: "Message is too long." };

  const access = await getViewerAccess(userId, listId);
  if (!access?.isMember) return { error: "You can't post in this chat." };

  const now = new Date();
  const [message] = await prisma.$transaction([
    prisma.listChatMessage.create({
      data: { listId, senderId: userId, body },
      select: { id: true, body: true, createdAt: true, senderId: true },
    }),
    prisma.listMembership.update({
      where: { listId_userId: { listId, userId } },
      data: { chatLastReadAt: now },
    }),
  ]);

  await broadcastListChatActivity(listId);

  const [sender, list] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { handle: true } }),
    prisma.list.findUnique({ where: { id: listId }, select: { name: true } }),
  ]);
  await sendPushToListMembers(listId, userId, "listChat", {
    title: list?.name ?? "List chat",
    body: `@${sender?.handle ?? "someone"}: ${body}`,
    data: { route: `/lists/${listId}` },
    threadId: `list:${listId}`,
  });

  return { message };
}

/**
 * Clear a list's chatroom — owner only. Hard-deletes every message in the chat for everyone
 * (unlike the per-user DM clear). Fires a ping so open drawers refetch and empty out.
 */
export async function clearChat(userId: string, listId: string) {
  await assertRole(userId, listId, "OWNER");
  await prisma.listChatMessage.deleteMany({ where: { listId } });
  await broadcastListChatActivity(listId);
}

/** Mark the list chat read up to now for the current user. */
export async function markChatRead(userId: string, listId: string) {
  await prisma.listMembership.updateMany({
    where: { listId, userId },
    data: { chatLastReadAt: new Date() },
  });
}
