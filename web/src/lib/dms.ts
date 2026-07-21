import "server-only";
import { prisma } from "@/lib/db";
import { areFriends } from "@/lib/friends";
import { type SharedBookmarkSnapshot } from "@/lib/core/bookmarks";

// Minimal public identity — same shape the friends data access exposes.
const otherUserSelect = { id: true, handle: true, icon: true } as const;

const DEFAULT_PAGE = 25;

export type MessagesPage = Awaited<ReturnType<typeof getMessages>>;
export type ConversationSummary = Awaited<
  ReturnType<typeof getConversations>
>[number];

/**
 * The current user's conversation inbox, newest activity first. Threads the user has cleared
 * with no newer message are omitted (they reappear once the other person writes again). Each
 * summary carries the other participant, a last-message preview, and an `unread` flag.
 */
export async function getConversations(userId: string) {
  const parts = await prisma.conversationParticipant.findMany({
    where: { userId },
    orderBy: { conversation: { lastMessageAt: "desc" } },
    select: {
      clearedAt: true,
      lastReadAt: true,
      conversation: {
        select: {
          id: true,
          lastMessageAt: true,
          // The other participant (1:1, so at most one row).
          participants: {
            where: { userId: { not: userId } },
            select: { user: { select: otherUserSelect } },
          },
          // Latest message overall — doubles as the preview and the "is anything
          // still visible after my clear?" check.
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { body: true, type: true, createdAt: true, senderId: true },
          },
        },
      },
    },
  });

  const summaries = [];
  for (const p of parts) {
    const conv = p.conversation;
    const last = conv.messages[0];
    if (!last) continue; // brand-new empty thread — nothing to show yet
    if (p.clearedAt && last.createdAt <= p.clearedAt) continue; // fully cleared
    const other = conv.participants[0]?.user;
    if (!other) continue; // orphaned (other account deleted)
    const unread =
      last.senderId !== userId &&
      (!p.lastReadAt || last.createdAt > p.lastReadAt);
    summaries.push({
      conversationId: conv.id,
      other,
      lastMessage: last,
      lastMessageAt: conv.lastMessageAt,
      unread,
    });
  }
  return summaries;
}

/**
 * A page of messages for a conversation, oldest→newest for display, plus a `nextCursor`
 * for loading older history. Keyset pagination on (createdAt desc, id) keeps every page a
 * cheap indexed read regardless of history length. Messages at/before the user's `clearedAt`
 * are excluded. Also returns the other participant and whether the user may still send.
 */
export async function getMessages(
  userId: string,
  conversationId: string,
  cursor?: string,
  limit: number = DEFAULT_PAGE,
) {
  const me = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { clearedAt: true },
  });
  if (!me) throw new Error("Conversation not found.");

  const other = await prisma.conversationParticipant.findFirst({
    where: { conversationId, userId: { not: userId } },
    select: { user: { select: otherUserSelect } },
  });

  const rows = await prisma.message.findMany({
    where: {
      conversationId,
      ...(me.clearedAt ? { createdAt: { gt: me.clearedAt } } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: { id: true, body: true, type: true, sharedBookmark: true, createdAt: true, senderId: true },
  });

  let nextCursor: string | null = null;
  if (rows.length > limit) {
    nextCursor = rows[limit - 1].id; // last row of this page → cursor for the next (older) page
    rows.length = limit;
  }

  // Narrow `sharedBookmark` from Prisma's recursive JsonValue to the concrete snapshot so the
  // tRPC wire type stays shallow (the JsonValue type otherwise blows up the mobile client's
  // type inference — "excessively deep"). Only BOOKMARK messages carry a snapshot.
  const messages = rows.reverse().map((m) => ({
    ...m,
    sharedBookmark: m.sharedBookmark as unknown as SharedBookmarkSnapshot | null,
  }));

  return {
    messages, // ascending for display
    nextCursor,
    other: other?.user ?? null,
    canSend: other ? await areFriends(userId, other.user.id) : false,
  };
}

/** Number of conversations with an unread message — drives the DMs tab badge. */
export async function getUnreadConversationCount(userId: string) {
  const convos = await getConversations(userId);
  return convos.filter((c) => c.unread).length;
}
