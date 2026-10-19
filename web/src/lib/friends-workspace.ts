import "server-only";
import { cache } from "react";
import {
  getFriends,
  getIncomingFriendRequests,
  getOutgoingFriendRequests,
  getFriendsListIds,
} from "@/lib/friends";
import { getConversations } from "@/lib/dms";
import { getCachedUserLists } from "@/lib/shell";

/**
 * Reads shared by the /friends layout (the desktop workspace pane) and the
 * pages under it (the mobile bodies), wrapped in React `cache` so a full load
 * of a /friends route reads each thing once, not once per layout and once per
 * page. `cache` is scoped to one request, so nothing is shared between users
 * or between requests.
 */

export const getCachedConversations = cache((userId: string) =>
  getConversations(userId),
);

export const getCachedIncomingFriendRequests = cache((userId: string) =>
  getIncomingFriendRequests(userId),
);

export const getCachedOutgoingFriendRequests = cache((userId: string) =>
  getOutgoingFriendRequests(userId),
);

/**
 * Friends plus what the "add to lists" picker on each friend row needs: the
 * lists the viewer owns (only owners can invite; `addFriendToLists` asserts
 * OWNER) and which of them each friend already belongs to.
 */
export const getFriendsWithListPicker = cache(async (userId: string) => {
  const [friends, memberships] = await Promise.all([
    getFriends(userId),
    getCachedUserLists(userId),
  ]);
  const ownedLists = memberships
    .filter((m) => m.role === "OWNER")
    .map((m) => ({ id: m.listId, name: m.list.name, icon: m.list.icon }));
  const memberMap = await getFriendsListIds(
    ownedLists.map((l) => l.id),
    friends.map((f) => f.friend.id),
  );
  return { friends, ownedLists, memberMap };
});
