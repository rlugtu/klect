"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { atHandle } from "@/lib/handle";
import { PixelCard } from "@/components/ui/PixelCard";
import { startConversation } from "@/lib/actions/dms";
import { UserIcon } from "@/components/ui/UserIcon";

type Friend = { id: string; handle: string | null; icon: string | null };

/** Pick a friend to open (or resume) a 1:1 conversation, then jump into the thread. */
export function NewChatList({ friends }: { friends: Friend[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function open(friend: Friend) {
    if (busyId) return;
    setBusyId(friend.id);
    try {
      const { conversationId } = await startConversation(friend.id);
      router.push(`/friends/dms/${conversationId}`);
    } catch {
      setBusyId(null);
    }
  }

  if (friends.length === 0) {
    return (
      <p className="text-muted">
        You have no friends to message yet — add some on the Friends tab.
      </p>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      {friends.map((f) => (
        <PixelCard key={f.id} className="p-0">
          <button
            type="button"
            disabled={busyId !== null}
            onClick={() => open(f)}
            className="flex w-full cursor-pointer items-center gap-3 p-4 text-left hover:text-primary disabled:opacity-50"
          >
            <UserIcon icon={f.icon} className="text-lg" />
            <span className="truncate text-sm font-semibold">
              {atHandle(f.handle)}
            </span>
            {busyId === f.id && (
              <span className="text-muted ml-auto text-xs">Opening…</span>
            )}
          </button>
        </PixelCard>
      ))}
    </section>
  );
}
