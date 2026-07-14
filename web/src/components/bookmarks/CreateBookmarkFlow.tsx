"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookmarkForm } from "./BookmarkForm";
import { PixelInput } from "@/components/ui/PixelInput";
import { PixelBadge } from "@/components/ui/PixelBadge";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { cn } from "@/lib/utils";
import { createBookmarkInLists } from "@/lib/actions/bookmarks";

/**
 * Standalone create-bookmark flow: pick one or more destination lists (and/or
 * create new ones by name), then fill the normal bookmark form. The bookmark is
 * added independently to each target list (one row per list).
 */
export function CreateBookmarkFlow({
  listOptions,
  tagSuggestions,
  tagColors,
}: {
  listOptions: { id: string; name: string; icon: string }[];
  tagSuggestions: string[];
  tagColors?: Record<string, string>;
}) {
  const router = useRouter();
  const [selectedListIds, setSelectedListIds] = useState<string[]>([]);
  const [newListNames, setNewListNames] = useState<string[]>([]);
  const [draftList, setDraftList] = useState("");
  const [newListsPublic, setNewListsPublic] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetCount = selectedListIds.length + newListNames.length;

  function toggleList(id: string) {
    setError(null);
    setSelectedListIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    );
  }

  function addNewList(raw: string) {
    const value = raw.trim();
    if (!value) return;
    setError(null);
    setNewListNames((cur) =>
      cur.some((n) => n.toLowerCase() === value.toLowerCase())
        ? cur
        : [...cur, value],
    );
    setDraftList("");
  }

  function removeNewList(name: string) {
    setNewListNames((cur) => cur.filter((n) => n !== name));
  }

  async function handleCreate(formData: FormData) {
    if (targetCount === 0) {
      setError("Pick at least one list for the bookmark.");
      return;
    }
    // Only new lists carry visibility; existing lists keep theirs.
    formData.set("newListsPublic", newListsPublic ? "on" : "");
    await createBookmarkInLists(selectedListIds, newListNames, formData);
    router.push("/");
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Destination lists */}
      <div className="flex flex-col gap-2">
        <FieldLabel>Add to lists</FieldLabel>

        {listOptions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {listOptions.map((l) => {
              const on = selectedListIds.includes(l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => toggleList(l.id)}
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

        {/* New lists created on the fly */}
        {newListNames.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              {newListNames.map((name) => (
                <PixelBadge key={name} tone="primary" onRemove={() => removeNewList(name)}>
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
                Make {newListNames.length === 1 ? "the new list" : "new lists"}{" "}
                <strong>public</strong> (anyone can view, read-only). Off = private.
              </span>
            </label>
          </div>
        )}

        <PixelInput
          value={draftList}
          onChange={(e) => setDraftList(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addNewList(draftList);
            }
          }}
          onBlur={() => addNewList(draftList)}
          placeholder="Or create a new list — type a name and press Enter"
          maxLength={30}
          aria-label="Create a new list"
        />

        {error && <p className="text-danger text-sm">{error}</p>}
      </div>

      <BookmarkForm
        action={handleCreate}
        submitLabel="Create"
        tagSuggestions={tagSuggestions}
        tagColors={tagColors}
      />
    </div>
  );
}
