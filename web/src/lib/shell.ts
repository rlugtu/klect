import "server-only";
import { cache } from "react";
import { getUserLists } from "@/lib/lists";
import { getIncomingRequests } from "@/lib/sharing";
import { getIncomingFriendRequests } from "@/lib/friends";
import { getUnreadConversationCount } from "@/lib/dms";
import { getSelectionStatus } from "@/lib/actions/entitlements";
import type { Role } from "@/generated/prisma/enums";

/**
 * Reads behind the desktop app shell (sidebar + top bar), wrapped in React
 * `cache` so the sidebar, the top bar, and the page underneath them can all ask
 * for the same thing in one request and it is only read once.
 *
 * Nothing here is new data: these are the existing lib reads (lists, list
 * requests, friend requests, unread DMs) and the shared entitlement read
 * (`getSelectionStatus`, the same one home, settings, and the paywall use, so the
 * usage meter can never disagree with what a create would actually refuse).
 */

export const getCachedUserLists = cache((userId: string) => getUserLists(userId));

export const getCachedIncomingRequests = cache((email: string) =>
  getIncomingRequests(email),
);

export const getCachedSelectionStatus = cache(() => getSelectionStatus());

/** One list row in the sidebar tree. */
export type ShellList = {
  id: string;
  name: string;
  icon: string;
  role: Role;
  bookmarkCount: number;
  locked: boolean;
};

/** Free-plan usage for the sidebar meter. Null for Pro users (no meter). */
export type ShellUsage = {
  listCount: number;
  listLimit: number;
  bookmarkCount: number;
  bookmarkLimit: number;
} | null;

export type ShellData = {
  ownedLists: ShellList[];
  sharedLists: ShellList[];
  /** Every list id in the viewer's personal order (owned and shared interleaved, as on Home). */
  listOrder: string[];
  unreadMessages: number;
  friendRequests: number;
  listRequests: number;
  usage: ShellUsage;
};

/** Everything the shell renders, read in parallel and deduped per request. */
export const getShellData = cache(
  async (userId: string, email: string): Promise<ShellData> => {
    const [memberships, listRequests, friendRequests, unreadMessages, status] =
      await Promise.all([
        getCachedUserLists(userId),
        getCachedIncomingRequests(email),
        getIncomingFriendRequests(userId),
        getUnreadConversationCount(userId),
        getCachedSelectionStatus(),
      ]);

    const lists: ShellList[] = memberships.map((m) => ({
      id: m.listId,
      name: m.list.name,
      icon: m.list.icon,
      role: m.role,
      bookmarkCount: m.list._count.bookmarks,
      locked: m.list.lockedAt !== null,
    }));

    return {
      ownedLists: lists.filter((l) => l.role === "OWNER"),
      sharedLists: lists.filter((l) => l.role !== "OWNER"),
      listOrder: lists.map((l) => l.id),
      unreadMessages,
      friendRequests: friendRequests.length,
      listRequests: listRequests.length,
      usage: status.isPro
        ? null
        : {
            listCount: status.activeListCount,
            listLimit: status.listLimit,
            bookmarkCount: status.activeBookmarkCount,
            bookmarkLimit: status.bookmarkLimit,
          },
    };
  },
);
