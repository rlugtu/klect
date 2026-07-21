"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelInput } from "@/components/ui/PixelInput";
import { PixelBadge } from "@/components/ui/PixelBadge";
import {
  saveSharedBookmark,
  loadMyListOptions,
  type SharedBookmarkSnapshot,
} from "@/lib/actions/dms";

type ListOption = { id: string; name: string; icon: string };

/**
 * A bookmark shared over DM, rendered as a card inside the thread. Shows a compact summary
 * with a preview toggle (expand to full details) and a Save action that copies the bookmark
 * into the recipient's own lists (independent copies), reusing the multi-list add pattern.
 */
export function SharedBookmarkCard({
  messageId,
  snapshot,
  mine,
}: {
  messageId: string;
  snapshot: SharedBookmarkSnapshot;
  mine: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);

  return (
    <div
      className={cn(
        "border-border bg-panel text-ink flex max-w-[85%] flex-col gap-2 border-2 p-3",
        mine ? "self-end" : "self-start",
      )}
    >
      {snapshot.images[0] && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={snapshot.images[0]}
          alt=""
          loading="lazy"
          className="pixel-box-sm bg-panel h-32 w-full object-cover"
        />
      )}
      <p className="text-primary text-sm font-semibold break-words">{snapshot.name}</p>
      {snapshot.location && (
        <p className="text-muted text-xs break-words">📍 {snapshot.location}</p>
      )}

      {expanded && (
        <div className="flex flex-col gap-2 text-xs">
          {snapshot.description && (
            <p className="break-words">{snapshot.description}</p>
          )}
          {snapshot.notes && (
            <p className="text-muted whitespace-pre-wrap break-words">{snapshot.notes}</p>
          )}
          {snapshot.tagNames.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {snapshot.tagNames.map((t) => (
                <PixelBadge key={t} tag>
                  {t}
                </PixelBadge>
              ))}
            </div>
          )}
          {snapshot.urls[0] && (
            <a
              href={/^https?:\/\//i.test(snapshot.urls[0]) ? snapshot.urls[0] : `https://${snapshot.urls[0]}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline break-all hover:text-accent"
            >
              Open ↗
            </a>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-muted hover:text-ink cursor-pointer text-xs underline"
        >
          {expanded ? "Hide preview" : "Preview"}
        </button>
        <PixelButton size="xs" className="ml-auto" onClick={() => setSaveOpen(true)}>
          Save
        </PixelButton>
      </div>

      <AnimatePresence>
        {saveOpen && (
          <SaveSharedBookmarkModal
            messageId={messageId}
            onClose={() => setSaveOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/** Slide-up sheet to pick lists (existing + new) and save the shared bookmark into each. */
function SaveSharedBookmarkModal({
  messageId,
  onClose,
}: {
  messageId: string;
  onClose: () => void;
}) {
  const [options, setOptions] = useState<ListOption[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [newNames, setNewNames] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [newListsPublic, setNewListsPublic] = useState(false);
  const [saving, setSaving] = useState(false);

  // Lazily load the destination lists when the sheet opens.
  useEffect(() => {
    loadMyListOptions()
      .then(setOptions)
      .catch(() => setOptions([]));
  }, []);

  const targetCount = selected.length + newNames.length;

  function toggle(id: string) {
    setSelected((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    );
  }

  function addNewList(raw: string) {
    const value = raw.trim();
    if (!value) return;
    setNewNames((cur) =>
      cur.some((n) => n.toLowerCase() === value.toLowerCase()) ? cur : [...cur, value],
    );
    setDraft("");
  }

  async function save() {
    if (targetCount === 0 || saving) return;
    setSaving(true);
    try {
      await saveSharedBookmark(messageId, selected, newNames, newListsPublic);
      toast.success(`Saved to ${targetCount} ${targetCount === 1 ? "list" : "lists"}`);
      onClose();
    } catch {
      toast.error("Couldn't save bookmark.");
      setSaving(false);
    }
  }

  return (
    <>
      <motion.div
        className="fixed inset-0 z-40 bg-black/40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="bg-panel border-border fixed inset-x-0 bottom-0 z-50 flex max-h-[80vh] flex-col border-t-2"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "tween", duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
        role="dialog"
        aria-label="Save bookmark to lists"
      >
        <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col gap-3 px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="font-pixel text-primary text-sm">Save to lists</h2>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="text-muted hover:text-ink cursor-pointer"
            >
              <X size={18} aria-hidden />
            </button>
          </div>

          <div className="border-border flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto border-2 p-3">
            {options === null ? (
              <p className="text-muted m-auto text-sm">Loading lists…</p>
            ) : options.length === 0 && newNames.length === 0 ? (
              <p className="text-muted m-auto text-center text-sm">
                No lists yet — create one below.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {options.map((l) => {
                  const on = selected.includes(l.id);
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => toggle(l.id)}
                      aria-pressed={on}
                      className={cn(
                        "border-border bg-panel hover:border-primary flex cursor-pointer items-center gap-1.5 border-2 px-2 py-1 text-sm",
                        on && "border-primary bg-primary/20",
                      )}
                    >
                      <span aria-hidden>{l.icon}</span>
                      <span className="max-w-[10rem] truncate">{l.name}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {newNames.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-2">
                  {newNames.map((name) => (
                    <PixelBadge
                      key={name}
                      tone="primary"
                      onRemove={() => setNewNames((cur) => cur.filter((n) => n !== name))}
                    >
                      📁 {name} (new)
                    </PixelBadge>
                  ))}
                </div>
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newListsPublic}
                    onChange={(e) => setNewListsPublic(e.target.checked)}
                    className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]"
                  />
                  <span className="text-muted text-xs">
                    Make {newNames.length === 1 ? "the new list" : "new lists"}{" "}
                    <strong>public</strong> (anyone can view, read-only). Off = private.
                  </span>
                </label>
              </div>
            )}
          </div>

          <PixelInput
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addNewList(draft);
              }
            }}
            onBlur={() => addNewList(draft)}
            placeholder="Or create a new list — type a name and press Enter"
            maxLength={30}
            aria-label="Create a new list"
          />

          <PixelButton
            onClick={save}
            disabled={saving || targetCount === 0}
            className="w-full"
          >
            {saving ? "Saving…" : "Save"}
          </PixelButton>
        </div>
      </motion.div>
    </>
  );
}
