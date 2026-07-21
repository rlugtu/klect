import "server-only";
import { prisma } from "@/lib/db";
import { getUnreadConversationCount } from "@/lib/dms";

/**
 * Push notification categories — each maps 1:1 to a boolean column on
 * `NotificationPreference` and to a user-facing toggle in the mobile Settings screen.
 * Keep this list, the schema columns, and the mobile toggles in lockstep.
 */
export const NOTIFICATION_CATEGORIES = [
  "directMessages",
  "listChat",
  "friends",
  "lists",
  "comments",
  "polls",
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];
export type NotificationPreferences = Record<NotificationCategory, boolean>;

/** Everything on. Used when a user has no `NotificationPreference` row yet. */
const DEFAULT_PREFERENCES: NotificationPreferences = {
  directMessages: true,
  listChat: true,
  friends: true,
  lists: true,
  comments: true,
  polls: true,
};

/**
 * Register (or move) a device's Expo push token to the current user. Idempotent via the
 * unique `token`: re-registering the same device refreshes it, and a device that signs
 * into a different account is reassigned rather than duplicated.
 */
export async function registerDeviceToken(
  userId: string,
  token: string,
  platform: string,
) {
  if (!token) return;
  await prisma.deviceToken.upsert({
    where: { token },
    update: { userId, platform },
    create: { userId, token, platform },
  });
}

/** Drop a device token (called on sign-out / when push is disabled). */
export async function unregisterDeviceToken(token: string) {
  if (!token) return;
  await prisma.deviceToken.deleteMany({ where: { token } });
}

/** The user's per-category push prefs, filling defaults when no row exists. */
export async function getNotificationPreferences(
  userId: string,
): Promise<NotificationPreferences> {
  const row = await prisma.notificationPreference.findUnique({
    where: { userId },
  });
  if (!row) return { ...DEFAULT_PREFERENCES };
  return {
    directMessages: row.directMessages,
    listChat: row.listChat,
    friends: row.friends,
    lists: row.lists,
    comments: row.comments,
    polls: row.polls,
  };
}

/** Upsert a subset of the user's push prefs; returns the full resulting set. */
export async function updateNotificationPreferences(
  userId: string,
  patch: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  const clean: Partial<NotificationPreferences> = {};
  for (const category of NOTIFICATION_CATEGORIES) {
    if (typeof patch[category] === "boolean") clean[category] = patch[category];
  }
  const row = await prisma.notificationPreference.upsert({
    where: { userId },
    update: clean,
    create: { userId, ...clean },
  });
  return {
    directMessages: row.directMessages,
    listChat: row.listChat,
    friends: row.friends,
    lists: row.lists,
    comments: row.comments,
    polls: row.polls,
  };
}

/**
 * The user's "needs attention" count — the single source of truth for the iOS app-icon
 * badge. Kept aligned with what the mobile tab badge already surfaces: unread DM threads
 * + incoming friend requests + pending list-join requests addressed to the user. Fed into
 * every push payload's `badge` and exposed via the `notifications.badgeCount` query so the
 * server and client never disagree.
 */
export async function computeBadgeCount(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  const [dmUnread, friendRequests, listInvites] = await Promise.all([
    getUnreadConversationCount(userId),
    prisma.friendship.count({
      where: { addresseeId: userId, status: "PENDING" },
    }),
    user
      ? prisma.listInvite.count({
          where: { email: user.email.toLowerCase(), status: "PENDING" },
        })
      : Promise.resolve(0),
  ]);
  return dmUnread + friendRequests + listInvites;
}
