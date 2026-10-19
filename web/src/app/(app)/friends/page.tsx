import Link from "next/link";
import { requireOnboardedUser } from "@/lib/session";
import {
  getCachedIncomingFriendRequests,
  getCachedOutgoingFriendRequests,
  getFriendsWithListPicker,
} from "@/lib/friends-workspace";
import { getUnreadConversationCount } from "@/lib/dms";
import { AddFriendForm } from "@/components/friends/AddFriendForm";
import { FriendRow } from "@/components/friends/FriendRow";
import { FriendsTabs } from "@/components/friends/FriendsTabs";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelBadge } from "@/components/ui/PixelBadge";
import { MobileOnly } from "@/components/ui/MobileOnly";
import { WorkspaceEmpty } from "@/components/friends/WorkspaceEmpty";
import { ArrowLeft, Inbox, Clock } from "lucide-react";

export default async function FriendsPage() {
  const user = await requireOnboardedUser();
  // Same cached reads as friends/layout.tsx, so the layout and this page
  // share one read of each per request.
  const [{ friends, ownedLists, memberMap }, incoming, outgoing, unread] =
    await Promise.all([
      getFriendsWithListPicker(user.id),
      getCachedIncomingFriendRequests(user.id),
      getCachedOutgoingFriendRequests(user.id),
      getUnreadConversationCount(user.id),
    ]);

  return (
    // At lg+ this page is the right pane of the messages workspace
    // (friends/layout.tsx), whose left pane already holds everything below, so
    // only the empty state shows there. Below lg it renders as before.
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12 lg:h-full lg:max-w-none lg:p-0">
      <MobileOnly>
        <header className="flex items-center gap-3">
          <Link href="/">
            <PixelButton variant="secondary" size="sm">
              <ArrowLeft size={14} aria-hidden /> Back
            </PixelButton>
          </Link>
          <h1 className="text-primary text-xl font-bold">Friends</h1>
          <Link href="/friends/requests" className="ml-auto">
            <PixelButton variant="secondary" size="sm">
              <Inbox size={14} aria-hidden /> Requests
              {incoming.length > 0 && (
                <PixelBadge tone="accent" className="ml-1 px-1.5 py-0">
                  {incoming.length}
                </PixelBadge>
              )}
            </PixelButton>
          </Link>
          <Link href="/friends/pending">
            <PixelButton variant="secondary" size="sm">
              <Clock size={14} aria-hidden /> Pending
              {outgoing.length > 0 && (
                <PixelBadge tone="accent" className="ml-1 px-1.5 py-0">
                  {outgoing.length}
                </PixelBadge>
              )}
            </PixelButton>
          </Link>
        </header>

        <FriendsTabs active="friends" myId={user.id} initialUnread={unread} />

        <AddFriendForm />

        <section className="flex flex-col gap-3">
          {friends.length === 0 ? (
            <p className="text-muted">
              No friends yet — add someone by @handle above.
            </p>
          ) : (
            friends.map((f) => (
              <FriendRow
                key={f.friendshipId}
                friendshipId={f.friendshipId}
                friend={f.friend}
                lists={ownedLists}
                memberListIds={memberMap[f.friend.id] ?? []}
              />
            ))
          )}
        </section>
      </MobileOnly>

      <WorkspaceEmpty title="Your friends">
        Message a friend, accept requests, or add someone by @handle from the
        Friends tab on the left.
      </WorkspaceEmpty>
    </main>
  );
}
