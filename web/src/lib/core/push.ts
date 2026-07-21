import "server-only";
import {
  Expo,
  type ExpoPushMessage,
  type ExpoPushTicket,
} from "expo-server-sdk";
import { prisma } from "@/lib/db";
import {
  computeBadgeCount,
  type NotificationCategory,
} from "@/lib/core/notifications";

/**
 * Server-side push delivery — the lockscreen/badge counterpart to the content-free
 * realtime pings ({@link ./dm-realtime.ts}, {@link ./list-chat-realtime.ts}). Called
 * fire-and-forget right next to those pings inside the core write functions, so backend
 * logic stays written once and both delivery channels stay in lockstep.
 *
 * Best-effort by design: every path is wrapped so a push failure never blocks (or throws
 * out of) the write that triggered it, and the whole thing no-ops cleanly when no devices
 * are registered / the Expo SDK is unconfigured.
 */

export type PushPayload = {
  title: string;
  body: string;
  /** Deep-link target + extra data delivered to the client for tap handling. */
  data?: Record<string, unknown>;
  /** iOS grouping key so a thread's notifications collapse together. */
  threadId?: string;
};

let expoClient: Expo | null = null;
function getExpo(): Expo {
  if (!expoClient) {
    // accessToken is optional; when unset the SDK still sends (unauthenticated).
    expoClient = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN });
  }
  return expoClient;
}

/**
 * Send a push to a set of users for a category. Recipients who have muted the category
 * (via `NotificationPreference`) are dropped; an absent prefs row means all-on. Each
 * device gets its own user's badge count. Tokens the push service reports as
 * `DeviceNotRegistered` are pruned.
 */
export async function sendPushToUsers(
  recipientUserIds: string[],
  category: NotificationCategory,
  payload: PushPayload,
) {
  try {
    const userIds = [...new Set(recipientUserIds)].filter(Boolean);
    if (userIds.length === 0) return;

    // Tokens for these users, filtered by their per-category preference. `null` prefs row
    // = defaults (all on), so include those too.
    const tokens = await prisma.deviceToken.findMany({
      where: {
        userId: { in: userIds },
        user: {
          OR: [
            { notificationPreference: null },
            { notificationPreference: { [category]: true } },
          ],
        },
      },
      select: { token: true, userId: true },
    });
    if (tokens.length === 0) return;

    // Per-user badge so each device shows that user's own attention count.
    const uniqueUsers = [...new Set(tokens.map((t) => t.userId))];
    const badgeByUser = new Map<string, number>();
    await Promise.all(
      uniqueUsers.map(async (uid) => {
        try {
          badgeByUser.set(uid, await computeBadgeCount(uid));
        } catch {
          // Badge is best-effort; omit rather than fail the send.
        }
      }),
    );

    const expo = getExpo();
    const messages: ExpoPushMessage[] = tokens
      .filter((t) => Expo.isExpoPushToken(t.token))
      .map((t) => ({
        to: t.token,
        sound: "default",
        title: payload.title,
        body: payload.body,
        data: payload.data ?? {},
        badge: badgeByUser.get(t.userId),
        ...(payload.threadId ? { threadId: payload.threadId } : {}),
      }));
    if (messages.length === 0) return;

    const chunks = expo.chunkPushNotifications(messages);
    const deadTokens: string[] = [];
    for (const chunk of chunks) {
      let tickets: ExpoPushTicket[] = [];
      try {
        tickets = await expo.sendPushNotificationsAsync(chunk);
      } catch {
        continue; // one bad chunk shouldn't sink the rest
      }
      tickets.forEach((ticket, j) => {
        if (
          ticket.status === "error" &&
          ticket.details?.error === "DeviceNotRegistered"
        ) {
          const to = chunk[j]?.to;
          if (typeof to === "string") deadTokens.push(to);
        }
      });
    }

    if (deadTokens.length > 0) {
      await prisma.deviceToken.deleteMany({
        where: { token: { in: deadTokens } },
      });
    }
  } catch {
    // Best-effort — like the realtime pings, delivery never blocks the write path.
  }
}

/**
 * Fan-out convenience: push to every member of a list except the actor. Used for
 * list-scoped events (chat, comments, polls).
 */
export async function sendPushToListMembers(
  listId: string,
  exceptUserId: string,
  category: NotificationCategory,
  payload: PushPayload,
) {
  try {
    const members = await prisma.listMembership.findMany({
      where: { listId, userId: { not: exceptUserId } },
      select: { userId: true },
    });
    await sendPushToUsers(
      members.map((m) => m.userId),
      category,
      payload,
    );
  } catch {
    // Best-effort.
  }
}
