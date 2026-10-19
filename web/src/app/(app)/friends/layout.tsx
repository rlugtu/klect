import type { ReactNode } from "react";
import { requireOnboardedUser } from "@/lib/session";
import {
  getCachedConversations,
  getCachedIncomingFriendRequests,
  getCachedOutgoingFriendRequests,
  getFriendsWithListPicker,
} from "@/lib/friends-workspace";
import { FriendsWorkspacePane } from "@/components/friends/FriendsWorkspacePane";

/**
 * Messages and Friends as one two-pane workspace at lg (1024px) and up: the
 * left pane (inbox, friends, add by handle, requests, pending) lives here so it
 * stays mounted while the right pane swaps between conversations. Every route
 * under /friends keeps its own URL and page; the page is the right pane.
 *
 * Below lg the pane is display:none and the wrappers are plain blocks, so each
 * page renders exactly as before. The reads still run there (the server cannot
 * see the viewport), the same trade-off the shell makes. They go through the
 * per-request cached reads in lib/friends-workspace.ts, which the pages below
 * also use, so a full load reads each thing once.
 *
 * Layouts do not re-render on navigation, so the pane polls conversations
 * itself and server actions that revalidate refresh the rest.
 */
export default async function FriendsLayout({ children }: { children: ReactNode }) {
  const user = await requireOnboardedUser();
  const [conversations, { friends, ownedLists, memberMap }, incoming, outgoing] =
    await Promise.all([
      getCachedConversations(user.id),
      getFriendsWithListPicker(user.id),
      getCachedIncomingFriendRequests(user.id),
      getCachedOutgoingFriendRequests(user.id),
    ]);

  return (
    <div className="lg:grid lg:h-[calc(100dvh-3.5rem)] lg:grid-cols-[20rem_minmax(0,1fr)] xl:grid-cols-[23rem_minmax(0,1fr)]">
      <aside
        aria-label="Messages and friends"
        className="ws-pane hidden lg:flex lg:min-h-0 lg:flex-col"
      >
        <FriendsWorkspacePane
          myId={user.id}
          conversations={conversations}
          friends={friends}
          ownedLists={ownedLists}
          memberMap={memberMap}
          incoming={incoming.map((r) => ({ id: r.id, user: r.requester }))}
          outgoing={outgoing.map((r) => ({ id: r.id, user: r.addressee }))}
        />
      </aside>
      <div className="lg:min-h-0 lg:min-w-0 lg:overflow-y-auto">{children}</div>
    </div>
  );
}
