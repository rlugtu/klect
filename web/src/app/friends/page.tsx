import Link from "next/link";
import { requireOnboardedUser } from "@/lib/session";
import { getUserLists } from "@/lib/lists";
import {
  getFriends,
  getIncomingFriendRequests,
  getOutgoingFriendRequests,
  getFriendsListIds,
} from "@/lib/friends";
import { AddFriendForm } from "@/components/friends/AddFriendForm";
import { FriendRow } from "@/components/friends/FriendRow";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelBadge } from "@/components/ui/PixelBadge";
import { ArrowLeft, Inbox, Clock } from "lucide-react";

export default async function FriendsPage() {
  const user = await requireOnboardedUser();
  const [friends, incoming, outgoing, memberships] = await Promise.all([
    getFriends(user.id),
    getIncomingFriendRequests(user.id),
    getOutgoingFriendRequests(user.id),
    getUserLists(user.id),
  ]);

  // Only lists the user OWNS can receive invites (addFriendToLists asserts OWNER).
  const ownedLists = memberships
    .filter((m) => m.role === "OWNER")
    .map((m) => ({ id: m.listId, name: m.list.name, icon: m.list.icon }));

  const memberMap = await getFriendsListIds(
    ownedLists.map((l) => l.id),
    friends.map((f) => f.friend.id),
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
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

      <AddFriendForm />

      <section className="flex flex-col gap-3">
        {friends.length === 0 ? (
          <p className="text-muted">
            No friends yet — add someone by email above.
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
    </main>
  );
}
