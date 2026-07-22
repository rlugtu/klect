"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { PixelButton } from "@/components/ui/PixelButton";
import {
  loadMessages,
  sendMessage,
  markRead,
  type MessagesPage,
  type SharedBookmarkSnapshot,
} from "@/lib/actions/dms";
import { SharedBookmarkCard } from "@/components/dms/SharedBookmarkCard";
import { ReportControl } from "@/components/moderation/ReportControl";
import { ProfileModerationActions } from "@/components/moderation/ProfileModerationActions";
import { subscribeDm, realtimeEnabled } from "@/lib/realtime/client";

type Message = MessagesPage["messages"][number];

/**
 * A chat thread. Loads older history on demand (keyset cursor) and refreshes the newest page
 * off the conversation's realtime channel (polling fallback). Sending is disabled when the
 * two are no longer friends, but the history stays readable.
 */
export function DmThread({
  myId,
  conversationId,
  initial,
}: {
  myId: string;
  conversationId: string;
  initial: MessagesPage;
}) {
  const [messages, setMessages] = useState<Message[]>(initial.messages);
  const [olderCursor, setOlderCursor] = useState(initial.nextCursor);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Merge a freshly-fetched newest page into state, de-duping by id and keeping order.
  const mergeNewest = useCallback((incoming: Message[]) => {
    setMessages((cur) => {
      const seen = new Set(cur.map((m) => m.id));
      const added = incoming.filter((m) => !seen.has(m.id));
      if (added.length === 0) return cur;
      return [...cur, ...added].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    });
  }, []);

  const refreshNewest = useCallback(() => {
    loadMessages(conversationId)
      .then((p) => mergeNewest(p.messages))
      .catch(() => {});
  }, [conversationId, mergeNewest]);

  // Mark read on open + subscribe/poll for new messages.
  useEffect(() => {
    markRead(conversationId).catch(() => {});
    const unsub = subscribeDm(`dm:conv:${conversationId}`, () => {
      refreshNewest();
      markRead(conversationId).catch(() => {});
    });
    const id = setInterval(refreshNewest, realtimeEnabled() ? 20000 : 5000);
    return () => {
      unsub();
      clearInterval(id);
    };
  }, [conversationId, refreshNewest]);

  // Keep pinned to the latest message.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function loadOlder() {
    if (!olderCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const p = await loadMessages(conversationId, olderCursor);
      setMessages((cur) => {
        const seen = new Set(cur.map((m) => m.id));
        const older = p.messages.filter((m) => !seen.has(m.id));
        return [...older, ...cur];
      });
      setOlderCursor(p.nextCursor);
    } finally {
      setLoadingOlder(false);
    }
  }

  async function send() {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await sendMessage(conversationId, text);
      if (res.message) {
        setBody("");
        mergeNewest([res.message]);
      } else {
        setError(res.error ?? "Couldn't send message.");
      }
    } catch {
      setError("Couldn't send message.");
    }
    setSending(false);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {initial.other && (
        <details className="text-sm">
          <summary className="text-muted hover:text-ink cursor-pointer select-none">
            Safety &amp; blocking
          </summary>
          <div className="pt-2">
            <ProfileModerationActions
              targetUserId={initial.other.id}
              handle={initial.other.handle}
              blocked={false}
            />
          </div>
        </details>
      )}
      <div className="border-border flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto border-2 p-4">
        {olderCursor && (
          <button
            type="button"
            onClick={loadOlder}
            disabled={loadingOlder}
            className="text-muted hover:text-ink self-center text-xs underline disabled:opacity-50"
          >
            {loadingOlder ? "Loading…" : "Load older messages"}
          </button>
        )}
        {messages.length === 0 && (
          <p className="text-muted m-auto text-sm">
            No messages yet — say hi 👋
          </p>
        )}
        {messages.map((m) => {
          const mine = m.senderId === myId;
          if (m.type === "BOOKMARK") {
            return (
              <div
                key={m.id}
                className={cn(
                  "flex max-w-full flex-col gap-1",
                  mine ? "items-end self-end" : "items-start self-start",
                )}
              >
                {m.body && (
                  <div
                    className={cn(
                      "max-w-[85%] px-3 py-2 text-sm break-words",
                      mine
                        ? "bg-primary text-primary-ink"
                        : "bg-panel text-ink border-border border-2",
                    )}
                  >
                    {m.body}
                  </div>
                )}
                <SharedBookmarkCard
                  messageId={m.id}
                  snapshot={m.sharedBookmark as unknown as SharedBookmarkSnapshot}
                  mine={mine}
                />
              </div>
            );
          }
          return (
            <div
              key={m.id}
              className={cn(
                "flex max-w-[75%] flex-col gap-1",
                mine ? "self-end items-end" : "self-start items-start",
              )}
            >
              <div
                className={cn(
                  "px-3 py-2 text-sm break-words",
                  mine
                    ? "bg-primary text-primary-ink"
                    : "bg-panel text-ink border-border border-2",
                )}
              >
                {m.body}
              </div>
              {!mine && (
                <ReportControl targetType="MESSAGE" targetId={m.id} triggerLabel="" />
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {initial.canSend ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex items-center gap-2"
        >
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Message…"
            className="border-border bg-panel text-ink min-w-0 flex-1 border-2 px-3 py-2 text-sm"
          />
          <PixelButton type="submit" size="sm" disabled={sending || !body.trim()}>
            Send
          </PixelButton>
        </form>
      ) : (
        <p className="text-muted border-border border-2 p-3 text-center text-sm">
          You&apos;re no longer friends — add them again to keep messaging.
        </p>
      )}
      {error && <p className="text-danger text-sm">{error}</p>}
    </div>
  );
}
