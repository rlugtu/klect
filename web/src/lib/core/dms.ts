import "server-only";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { type MessageType } from "@/generated/prisma/enums";
import { areFriends } from "@/lib/friends";
import { isBlockedEitherWay } from "@/lib/blocks";
import { broadcastDmActivity } from "@/lib/core/dm-realtime";
import { sendPushToUsers } from "@/lib/core/push";
import {
  buildBookmarkSnapshot,
  type SharedBookmarkSnapshot,
} from "@/lib/core/bookmarks";

// The message shape returned to clients — shared by the send result and the read side
// (getMessages/getConversations) so text and shared-bookmark messages carry the same fields.
const messageSelect = {
  id: true,
  body: true,
  type: true,
  sharedBookmark: true,
  createdAt: true,
  senderId: true,
} as const;

// `sharedBookmark` is typed as the concrete snapshot (not Prisma.JsonValue) so the tRPC wire
// type stays shallow — the recursive JsonValue type otherwise blows up inference on the
// type-only mobile client ("excessively deep"). Populated only for BOOKMARK messages.
export type DmMessage = {
  id: string;
  body: string;
  type: MessageType;
  sharedBookmark: SharedBookmarkSnapshot | null;
  createdAt: Date;
  senderId: string;
};

export type SendMessageResult =
  | { error: string; message?: undefined }
  | { error?: undefined; message: DmMessage };

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
  if (await isBlockedEitherWay(userId, otherUserId)) {
    throw new Error("You can't message this user.");
  }
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
 * Shared write path for any message kind. Re-checks the live friendship (unfriending stops
 * new messages even though the thread persists) and that the caller is a participant, writes
 * the row, bumps `lastMessageAt`, marks the sender caught up, fires the realtime ping, and
 * sends the push (with the caller-supplied `pushBody`). Both the text and shared-bookmark
 * send paths funnel through here; only the caller-facing message data differs.
 */
async function deliverMessage(
  userId: string,
  conversationId: string,
  data: { body: string; type?: MessageType; sharedBookmark?: Prisma.InputJsonValue },
  pushBody: string,
): Promise<SendMessageResult> {
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
  if (await isBlockedEitherWay(userId, other.userId)) {
    return { error: "You can't message this user." };
  }
  if (!(await areFriends(userId, other.userId))) {
    return { error: "You can no longer message this user." };
  }

  const now = new Date();
  const [message] = await prisma.$transaction([
    prisma.message.create({
      data: { conversationId, senderId: userId, ...data },
      select: messageSelect,
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
    body: pushBody,
    data: { route: `/dm/${conversationId}` },
    threadId: `dm:${conversationId}`,
  });

  return {
    message: {
      ...message,
      sharedBookmark: message.sharedBookmark as unknown as SharedBookmarkSnapshot | null,
    },
  };
}

/** Send a plain text message in a conversation. Empty bodies are rejected. */
export async function sendMessage(
  userId: string,
  conversationId: string,
  bodyInput: string,
): Promise<SendMessageResult> {
  const body = bodyInput.trim();
  if (!body) return { error: "Message can't be empty." };
  if (body.length > MAX_BODY) return { error: "Message is too long." };
  return deliverMessage(userId, conversationId, { body }, body);
}

/**
 * Send a shared-bookmark message. Unlike a text message the caption may be empty (the card
 * stands on its own), so this path allows a blank body. The push falls back to a generic
 * "Shared a bookmark" line when there's no caption.
 */
export async function sendBookmarkMessage(
  userId: string,
  conversationId: string,
  snapshot: SharedBookmarkSnapshot,
  caption: string,
): Promise<SendMessageResult> {
  const body = caption.trim().slice(0, MAX_BODY);
  const pushBody = body || `Shared a bookmark: ${snapshot.name}`;
  return deliverMessage(
    userId,
    conversationId,
    {
      body,
      type: "BOOKMARK",
      sharedBookmark: snapshot as unknown as Prisma.InputJsonValue,
    },
    pushBody,
  );
}

export type ShareBookmarkResult = {
  results: { userId: string; ok: boolean; error?: string }[];
};

/**
 * Share a bookmark to one or more friends over DM. Builds the snapshot once (which also
 * enforces the sender can view the source bookmark), then for each recipient get-or-creates
 * the 1:1 conversation and sends a shared-bookmark message. Tolerant of partial failure —
 * one recipient failing (e.g. no longer a friend) never aborts the batch; every recipient's
 * outcome comes back in `results`.
 */
export async function shareBookmark(
  userId: string,
  bookmarkId: string,
  recipientUserIds: string[],
  caption: string,
): Promise<ShareBookmarkResult> {
  const snapshot = await buildBookmarkSnapshot(userId, bookmarkId);
  const recipients = [...new Set(recipientUserIds.filter(Boolean))];

  const results = [];
  for (const recipientId of recipients) {
    try {
      const { conversationId } = await startConversation(userId, recipientId);
      const res = await sendBookmarkMessage(userId, conversationId, snapshot, caption);
      if (res.error) results.push({ userId: recipientId, ok: false, error: res.error });
      else results.push({ userId: recipientId, ok: true });
    } catch (e) {
      results.push({
        userId: recipientId,
        ok: false,
        error: e instanceof Error ? e.message : "Couldn't send.",
      });
    }
  }
  return { results };
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
