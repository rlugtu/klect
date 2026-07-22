"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle, Trash2, X } from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { atHandle } from "@/lib/handle";
import { PixelButton } from "@/components/ui/PixelButton";
import { ReportControl } from "@/components/moderation/ReportControl";
import {
  loadChatMessages,
  loadChatUnread,
  sendChatMessage,
  clearChat,
  markChatRead,
  type ChatMessagesPage,
  type ChatMessage,
} from "@/lib/actions/list-chat";
import { subscribeListChat, realtimeEnabled } from "@/lib/realtime/client";

const ROLE_LABEL: Record<string, string> = {
  OWNER: "owner",
  COLLABORATOR: "collaborator",
  VIEWER: "viewer",
};

/**
 * The list-chat entry point: a header chat icon with an unread badge that opens a slide-up
 * drawer (70vh) holding the chatroom. Mirrors {@link ../dms/DmThread} — loads older history
 * on demand (keyset cursor) and refreshes the newest page off the list's realtime channel
 * (polling fallback). Any member can post; only the owner can clear.
 */
export function ListChatLauncher({
  listId,
  myId,
  isOwner,
  initial,
  initialUnread,
}: {
  listId: string;
  myId: string;
  isOwner: boolean;
  initial: ChatMessagesPage;
  initialUnread: number;
}) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [messages, setMessages] = useState<ChatMessage[]>(initial.messages);
  const [olderCursor, setOlderCursor] = useState(initial.nextCursor);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Merge a freshly-fetched newest page into state, de-duping by id and keeping order.
  const mergeNewest = useCallback((incoming: ChatMessage[]) => {
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
    loadChatMessages(listId)
      .then((p) => setMessages(p.messages)) // replace: an owner clear empties the room
      .catch(() => {});
  }, [listId]);

  const refreshUnread = useCallback(() => {
    loadChatUnread(listId)
      .then(setUnread)
      .catch(() => {});
  }, [listId]);

  // Keep the badge live even while the drawer is closed (realtime ping + polling fallback).
  useEffect(() => {
    const unsub = subscribeListChat(listId, () => {
      if (open) {
        refreshNewest();
        markChatRead(listId).catch(() => {});
      } else {
        refreshUnread();
      }
    });
    const id = setInterval(
      () => (open ? refreshNewest() : refreshUnread()),
      realtimeEnabled() ? 20000 : 5000,
    );
    return () => {
      unsub();
      clearInterval(id);
    };
  }, [listId, open, refreshNewest, refreshUnread]);

  // On open: catch up + mark read (the badge is cleared in the open handler).
  useEffect(() => {
    if (!open) return;
    refreshNewest();
    markChatRead(listId).catch(() => {});
  }, [open, listId, refreshNewest]);

  // Keep pinned to the latest message while open.
  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, open]);

  async function loadOlder() {
    if (!olderCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const p = await loadChatMessages(listId, olderCursor);
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
      const res = await sendChatMessage(listId, text);
      if (res.message) {
        setBody("");
        // Attach my identity/role so the row renders immediately (server echo is authoritative).
        mergeNewest([{ ...res.message, sender: null, role: null }]);
        refreshNewest();
      } else {
        setError(res.error ?? "Couldn't send message.");
      }
    } catch {
      setError("Couldn't send message.");
    }
    setSending(false);
  }

  async function doClear() {
    setClearing(true);
    try {
      await clearChat(listId);
      setMessages([]);
      setOlderCursor(null);
      setConfirmClear(false);
    } finally {
      setClearing(false);
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label="List chat"
        onClick={() => {
          setUnread(0);
          setOpen(true);
        }}
        className="pixel-box-sm pixel-press bg-panel text-ink relative inline-flex cursor-pointer items-center justify-center px-3 py-1"
      >
        <MessageCircle size={14} aria-hidden />
        {unread > 0 && (
          <span
            aria-label={`${unread} unread`}
            className="bg-accent text-primary-ink absolute -top-2 -right-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-bold"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              className="bg-panel border-border fixed inset-x-0 bottom-0 z-50 flex h-[70vh] flex-col border-t-2"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "tween", duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
              role="dialog"
              aria-label="List chat"
            >
              <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-3 px-6 py-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-pixel text-primary text-sm">Chat</h2>
                  <div className="flex items-center gap-2">
                    {isOwner &&
                      (confirmClear ? (
                        <div className="flex items-center gap-2">
                          <PixelButton
                            variant="danger"
                            size="xs"
                            disabled={clearing}
                            onClick={doClear}
                          >
                            {clearing ? "Clearing…" : "Clear all"}
                          </PixelButton>
                          <button
                            type="button"
                            onClick={() => setConfirmClear(false)}
                            className="text-muted hover:text-ink cursor-pointer text-xs underline"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          aria-label="Clear chat history"
                          onClick={() => setConfirmClear(true)}
                          className="text-muted hover:text-danger inline-flex cursor-pointer items-center gap-1 text-xs"
                        >
                          <Trash2 size={14} aria-hidden /> Clear
                        </button>
                      ))}
                    <button
                      type="button"
                      aria-label="Close chat"
                      onClick={() => setOpen(false)}
                      className="text-muted hover:text-ink cursor-pointer"
                    >
                      <X size={18} aria-hidden />
                    </button>
                  </div>
                </div>

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
                      No messages yet — start the conversation 💬
                    </p>
                  )}
                  {messages.map((m) => {
                    const mine = m.senderId === myId;
                    const roleLabel = m.role ? ROLE_LABEL[m.role] : null;
                    return (
                      <div
                        key={m.id}
                        className={cn(
                          "flex max-w-[80%] flex-col gap-0.5",
                          mine ? "self-end items-end" : "self-start items-start",
                        )}
                      >
                        {!mine && (
                          <span className="text-muted px-1 text-xs">
                            {atHandle(m.sender?.handle)}
                            {roleLabel && (
                              <span className="opacity-60"> · {roleLabel}</span>
                            )}
                          </span>
                        )}
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
                        <span className="text-muted flex items-center gap-1 px-1 text-[10px] opacity-70">
                          {timeAgo(m.createdAt)}
                          {!mine && (
                            <ReportControl
                              targetType="LIST_CHAT_MESSAGE"
                              targetId={m.id}
                              triggerLabel=""
                            />
                          )}
                        </span>
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
                    <PixelButton
                      type="submit"
                      size="sm"
                      disabled={sending || !body.trim()}
                    >
                      Send
                    </PixelButton>
                  </form>
                ) : (
                  <p className="text-muted border-border border-2 p-3 text-center text-sm">
                    Only members can post in this chat.
                  </p>
                )}
                {error && <p className="text-danger text-sm">{error}</p>}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
