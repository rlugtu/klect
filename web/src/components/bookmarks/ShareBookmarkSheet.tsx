"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { atHandle } from "@/lib/handle";
import { toast } from "@/lib/toast";
import { PixelButton } from "@/components/ui/PixelButton";
import { shareBookmark } from "@/lib/actions/dms";

type Friend = { id: string; handle: string | null; icon: string | null };

/**
 * The bookmark "send" entry point: an icon button that opens a slide-up sheet to pick one or
 * more friends and (optionally) add a caption, then shares the bookmark into each friend's DM.
 * Mirrors Instagram's share-to-DM. Recipients are friends only (DMs are friend-gated).
 */
export function ShareBookmarkSheet({
  bookmarkId,
  friends,
}: {
  bookmarkId: string;
  friends: Friend[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [caption, setCaption] = useState("");
  const [sending, setSending] = useState(false);

  function toggle(id: string) {
    setSelected((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    );
  }

  function close() {
    setOpen(false);
    setSelected([]);
    setCaption("");
  }

  async function send() {
    if (selected.length === 0 || sending) return;
    setSending(true);
    try {
      const { results } = await shareBookmark(bookmarkId, selected, caption);
      const sent = results.filter((r) => r.ok).length;
      const failed = results.length - sent;
      if (sent > 0) {
        toast.success(
          failed > 0
            ? `Sent to ${sent}, failed for ${failed}`
            : `Shared with ${sent} ${sent === 1 ? "friend" : "friends"}`,
        );
        close();
      } else {
        toast.error(results[0]?.error ?? "Couldn't share bookmark.");
      }
    } catch {
      toast.error("Couldn't share bookmark.");
    }
    setSending(false);
  }

  return (
    <>
      <button
        type="button"
        aria-label="Send to a friend"
        onClick={() => setOpen(true)}
        className="pixel-box-sm pixel-press bg-panel text-ink inline-flex cursor-pointer items-center gap-1.5 px-3 py-1 text-sm hover:text-primary"
      >
        <Send size={14} aria-hidden /> Send
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={close}
            />
            <motion.div
              className="bg-panel border-border fixed inset-x-0 bottom-0 z-50 flex max-h-[80vh] flex-col border-t-2"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "tween", duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
              role="dialog"
              aria-label="Send bookmark to a friend"
            >
              <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col gap-3 px-6 py-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-pixel text-primary text-sm">Send to…</h2>
                  <button
                    type="button"
                    aria-label="Close"
                    onClick={close}
                    className="text-muted hover:text-ink cursor-pointer"
                  >
                    <X size={18} aria-hidden />
                  </button>
                </div>

                {friends.length === 0 ? (
                  <p className="text-muted py-6 text-center text-sm">
                    Add friends to share bookmarks with them.
                  </p>
                ) : (
                  <div className="border-border flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto border-2 p-3">
                    {friends.map((f) => {
                      const on = selected.includes(f.id);
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => toggle(f.id)}
                          aria-pressed={on}
                          className={cn(
                            "border-border bg-panel hover:border-primary flex cursor-pointer items-center gap-3 border-2 px-3 py-2 text-left",
                            on && "border-primary bg-primary/20",
                          )}
                        >
                          <span aria-hidden className="text-lg">
                            {f.icon ?? "🔖"}
                          </span>
                          <span className="truncate text-sm font-semibold">
                            {atHandle(f.handle)}
                          </span>
                          <span
                            aria-hidden
                            className={cn(
                              "border-border ml-auto flex size-4 shrink-0 items-center justify-center border-2 text-[10px]",
                              on && "bg-primary text-primary-ink border-primary",
                            )}
                          >
                            {on ? "✓" : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                <input
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Add a message… (optional)"
                  className="border-border bg-panel text-ink border-2 px-3 py-2 text-sm"
                />

                <PixelButton
                  onClick={send}
                  disabled={sending || selected.length === 0}
                  className="w-full"
                >
                  {sending
                    ? "Sending…"
                    : selected.length > 1
                      ? `Send to ${selected.length}`
                      : "Send"}
                </PixelButton>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
