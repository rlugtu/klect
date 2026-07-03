"use client";

import { useId, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PixelInput } from "@/components/ui/PixelInput";
import { PixelBadge } from "@/components/ui/PixelBadge";

/**
 * Pill-based tag editor. Type + Enter/comma to add, × to remove.
 * Submits one hidden <input name={name}> per tag.
 */
export function TagInput({
  name = "tags",
  defaultValue = [],
  suggestions = [],
  existing = [],
}: {
  name?: string;
  defaultValue?: string[];
  suggestions?: string[];
  /** Tags already used in this list, offered as clickable quick-add chips. */
  existing?: string[];
}) {
  const [tags, setTags] = useState<string[]>(defaultValue);
  const [draft, setDraft] = useState("");
  const listId = useId();

  const quickAdd = existing.filter(
    (t) => !tags.some((tag) => tag.toLowerCase() === t.toLowerCase()),
  );

  function addTag(raw: string) {
    const value = raw.trim();
    if (!value) return;
    setTags((prev) =>
      prev.some((t) => t.toLowerCase() === value.toLowerCase())
        ? prev
        : [...prev, value],
    );
    setDraft("");
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  return (
    <div className="flex flex-col gap-2">
      {tags.map((tag) => (
        <input key={tag} type="hidden" name={name} value={tag} />
      ))}

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <AnimatePresence initial={false}>
            {tags.map((tag) => (
              <motion.span
                key={tag}
                layout
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ duration: 0.15 }}
                className="inline-flex"
              >
                <PixelBadge tone="primary" onRemove={() => removeTag(tag)}>
                  {tag}
                </PixelBadge>
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
      )}

      <PixelInput
        value={draft}
        list={listId}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            addTag(draft);
          } else if (e.key === "Backspace" && !draft && tags.length) {
            removeTag(tags[tags.length - 1]);
          }
        }}
        onBlur={() => addTag(draft)}
        placeholder="Add a tag and press Enter"
      />
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      {quickAdd.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-muted text-sm">Tags in this list:</span>
          <div className="flex flex-wrap gap-2">
            {quickAdd.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => addTag(t)}
                className="font-pixel border-border bg-panel hover:border-primary cursor-pointer border-2 px-2 py-1 text-sm uppercase"
              >
                ＋ {t}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
