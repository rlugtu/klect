"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MessageSquarePlus, Trash2 } from "lucide-react";
import { atHandle } from "@/lib/handle";
import { timeAgo } from "@/lib/utils";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelCard } from "@/components/ui/PixelCard";
import {
  loadConversations,
  clearConversation,
  type DmConversation,
} from "@/lib/actions/dms";
import { subscribeDm, realtimeEnabled } from "@/lib/realtime/client";

/**
 * DM inbox list. Rows link into a thread and show an unread dot + last-message preview.
 * Refreshes live off the user's realtime channel (polls as a fallback). Deleting a row
 * clears the thread for the current user only.
 */
export function DmInbox({
  myId,
  initial,
}: {
  myId: string;
  initial: DmConversation[];
}) {
  const [convos, setConvos] = useState(initial);

  useEffect(() => {
    let alive = true;
    const refresh = () =>
      loadConversations()
        .then((c) => alive && setConvos(c))
        .catch(() => {});
    const unsub = subscribeDm(`dm:user:${myId}`, refresh);
    const id = setInterval(refresh, realtimeEnabled() ? 20000 : 5000);
    return () => {
      alive = false;
      unsub();
      clearInterval(id);
    };
  }, [myId]);

  async function onDelete(conversationId: string) {
    setConvos((cur) => cur.filter((c) => c.conversationId !== conversationId));
    await clearConversation(conversationId);
  }

  return (
    <section className="flex flex-col gap-3">
      <Link href="/friends/dms/new" className="self-start">
        <PixelButton size="sm">
          <MessageSquarePlus size={14} aria-hidden /> New chat
        </PixelButton>
      </Link>

      {convos.length === 0 ? (
        <p className="text-muted">
          No conversations yet — start one with a friend.
        </p>
      ) : (
        convos.map((c) => (
          <DmRow key={c.conversationId} convo={c} onDelete={onDelete} />
        ))
      )}
    </section>
  );
}

function DmRow({
  convo,
  onDelete,
}: {
  convo: DmConversation;
  onDelete: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const name = atHandle(convo.other.handle);
  const mine = convo.lastMessage.senderId !== convo.other.id;

  return (
    <PixelCard className="flex items-center gap-3">
      <Link
        href={`/friends/dms/${convo.conversationId}`}
        className="flex min-w-0 flex-1 items-center gap-3 hover:text-primary"
      >
        {convo.unread && (
          <span
            aria-label="Unread"
            className="bg-accent size-2.5 shrink-0 rounded-full"
          />
        )}
        <span aria-hidden className="text-lg">
          {convo.other.icon ?? "🔖"}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold">{name}</span>
            <span className="text-muted shrink-0 text-xs">
              {timeAgo(convo.lastMessageAt)}
            </span>
          </span>
          <span
            className={
              convo.unread ? "text-ink truncate text-sm" : "text-muted truncate text-sm"
            }
          >
            {mine && "You: "}
            {convo.lastMessage.type === "BOOKMARK"
              ? convo.lastMessage.body || "Shared a bookmark"
              : convo.lastMessage.body}
          </span>
        </span>
      </Link>

      {confirming ? (
        <span className="flex shrink-0 items-center gap-1">
          <PixelButton
            variant="danger"
            size="xs"
            onClick={() => onDelete(convo.conversationId)}
          >
            Delete
          </PixelButton>
          <PixelButton
            variant="secondary"
            size="xs"
            onClick={() => setConfirming(false)}
          >
            Cancel
          </PixelButton>
        </span>
      ) : (
        <PixelButton
          variant="ghost"
          size="xs"
          aria-label="Delete chat"
          onClick={() => setConfirming(true)}
        >
          <Trash2 size={14} aria-hidden />
        </PixelButton>
      )}
    </PixelCard>
  );
}
