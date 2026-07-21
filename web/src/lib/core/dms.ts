import "server-only";
import { prisma } from "@/lib/db";
import { areFriends } from "@/lib/friends";
import { broadcastDmActivity } from "@/lib/core/dm-realtime";
import { sendPushToUsers } from "@/lib/core/push";

export type SendMessageResult =
  | { error: string; message?: undefined }
  | { error?: undefined; message: { id: string; body: string; createdAt: Date; senderId: string } };

const MAX_BODY = 4000;

/** Deterministic conversation key for a pair (sorted so it's the same from either side). */
function pairKeyFor(a: string, b: string) {
  return [a, b].sort().join(":");
}

/**
 * Get-or-create the 1:1 conversation between two friends. Gated on a live friendship —
 * you can only open a chat with a current friend. Idempotent + race-safe via the unique
 * `pairKey` (concurrent calls resolve to the same row). Returns the conversation id.
 */
export async function startConversation(userId: string, otherUserId: string) {
  if (userId === otherUserId) throw new Error("You can't message yourself.");
  if (!(await areFriends(userId, otherUserId))) {
    throw new Error("You can only message friends.");
  }
  const pairKey = pairKeyFor(userId, otherUserId);
  const convo = await prisma.conversation.upsert({
    where: { pairKey },
    update: {},
    create: {
      pairKey,
      participants: { create: [{ userId }, { userId: otherUserId }] },
    },
    select: { id: true },
  });
  return { conversationId: convo.id };
}

/**
 * Send a message in a conversation. Re-checks the live friendship (unfriending stops new
 * messages even though the thread persists) and that the caller is a participant. Bumps the
 * conversation's `lastMessageAt`, marks the sender caught up, and fires a realtime ping.
 */
export async function sendMessage(
  userId: string,
  conversationId: string,
  bodyInput: string,
): Promise<SendMessageResult> {
  const body = bodyInput.trim();
  if (!body) return { error: "Message can't be empty." };
  if (body.length > MAX_BODY) return { error: "Message is too long." };

  const [me, other] = await Promise.all([
    prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      select: { id: true },
    }),
    prisma.conversationParticipant.findFirst({
      where: { conversationId, userId: { not: userId } },
      select: { userId: true },
    }),
  ]);
  if (!me || !other) throw new Error("Conversation not found.");
  if (!(await areFriends(userId, other.userId))) {
    return { error: "You can no longer message this user." };
  }

  const now = new Date();
  const [message] = await prisma.$transaction([
    prisma.message.create({
      data: { conversationId, senderId: userId, body },
      select: { id: true, body: true, createdAt: true, senderId: true },
    }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: now },
    }),
    prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: now },
    }),
  ]);

  await broadcastDmActivity(conversationId, other.userId);

  const sender = await prisma.user.findUnique({
    where: { id: userId },
    select: { handle: true },
  });
  await sendPushToUsers([other.userId], "directMessages", {
    title: `@${sender?.handle ?? "someone"}`,
    body,
    data: { route: `/dm/${conversationId}` },
    threadId: `dm:${conversationId}`,
  });

  return { message };
}

/**
 * Clear (a.k.a. delete) a conversation for the current user only: hides it and its past
 * messages from them. A later message reappears the thread showing only messages after this
 * point. No-op if the user isn't a participant.
 */
export async function clearConversation(userId: string, conversationId: string) {
  const now = new Date();
  await prisma.conversationParticipant.updateMany({
    where: { conversationId, userId },
    data: { clearedAt: now, lastReadAt: now },
  });
}

/** Mark a conversation read up to now for the current user. */
export async function markRead(userId: string, conversationId: string) {
  await prisma.conversationParticipant.updateMany({
    where: { conversationId, userId },
    data: { lastReadAt: new Date() },
  });
}
