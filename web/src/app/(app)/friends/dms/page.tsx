import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireOnboardedUser } from "@/lib/session";
import { getCachedConversations } from "@/lib/friends-workspace";
import { FriendsTabs } from "@/components/friends/FriendsTabs";
import { DmInbox } from "@/components/dms/DmInbox";
import { PixelButton } from "@/components/ui/PixelButton";
import { MobileOnly } from "@/components/ui/MobileOnly";
import { WorkspaceEmpty } from "@/components/friends/WorkspaceEmpty";

export default async function DmInboxPage() {
  const user = await requireOnboardedUser();
  const conversations = await getCachedConversations(user.id);
  const unread = conversations.filter((c) => c.unread).length;

  return (
    // At lg+ this is the right pane of the messages workspace
    // (friends/layout.tsx); the inbox itself is the left pane there, so only
    // the "pick a conversation" state shows. Below lg it renders as before.
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12 lg:h-full lg:max-w-none lg:p-0">
      <MobileOnly>
        <header className="flex items-center gap-3">
          <Link href="/">
            <PixelButton variant="secondary" size="sm">
              <ArrowLeft size={14} aria-hidden /> Back
            </PixelButton>
          </Link>
          <h1 className="text-primary text-xl font-bold">Messages</h1>
        </header>

        <FriendsTabs active="dms" myId={user.id} initialUnread={unread} />

        <DmInbox myId={user.id} initial={conversations} />
      </MobileOnly>

      <WorkspaceEmpty title="Your messages">
        {conversations.length === 0
          ? "No conversations yet. Start one with a friend."
          : "Pick a conversation on the left to read and reply."}
      </WorkspaceEmpty>
    </main>
  );
}
