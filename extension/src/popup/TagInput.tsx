import { useState } from "react";

import { inputClass } from "./ui";

/** Matches web's own tag-name cap and keeps one runaway paste from filling the popup. */
const TAG_MAX = 30;

/**
 * Type-to-add chip editor over a plain `string[]`.
 *
 * `bookmarkInput.tagNames` is `z.array(z.string())` (free strings, no ids) because
 * `core.createBookmark` runs them through `normalizeTagNames` (trim, strip a leading `#`,
 * lowercase, de-dupe) and then `syncBookmarkTags`, which **upserts** each name against
 * `prisma.tag` on the `userId_name` unique key. A name that doesn't exist yet is created
 * there and then, with a color picked to avoid the ones already used in that list. So the
 * extension needs no tag lookup and no tags fetch: the server matches-or-creates by name,
 * and this input is correct as pure local state.
 *
 * Interaction is web's `TagInput` (Enter or comma commits, `×` removes, Backspace on an
 * empty draft pops the last chip, blur commits so a typed-then-clicked-away tag isn't
 * silently dropped) minus its `framer-motion` and `PixelInput`/`PixelBadge` dependencies,
 * which belong to web's design system and are not mirrored here. Mobile's comma-separated
 * single text field was the other precedent; chips won because the popup has no keyboard
 * accessory bar to lean on and a chip makes "what will actually be saved" visible.
 *
 * The `#` is stripped on the way in rather than on the way out, matching mobile's
 * `onChangeText` guard: it's a display affordance (see mobile's `TagPill`) and is never
 * stored, so showing a chip with one would misrepresent what the save does.
 */
export function TagInput({
  tags,
  onChange,
  disabled,
  inputId,
}: {
  tags: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  inputId: string;
}) {
  const [draft, setDraft] = useState("");

  function addTag(raw: string) {
    const value = raw.trim().replace(/^#+/, "").trim();
    setDraft("");
    if (!value) return;
    // Case-insensitive de-dupe here too: the server lowercases, so "Coffee" after
    // "coffee" would collapse on save and leave a chip that saved nothing.
    if (tags.some((t) => t.toLowerCase() === value.toLowerCase())) return;
    onChange([...tags, value]);
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  return (
    <div className="flex flex-col gap-1.5">
      {tags.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <li key={tag}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => removeTag(tag)}
                aria-label={`Remove the tag ${tag}`}
                className="flex items-center gap-1.5 rounded-skin-sm border border-border bg-panel px-2 py-1 text-xs text-ink"
              >
                <span className="max-w-32 truncate">#{tag}</span>
                <span className="text-muted">✕</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <input
        id={inputId}
        type="text"
        className={inputClass}
        placeholder="Add a tag and press Enter"
        value={draft}
        maxLength={TAG_MAX}
        autoCapitalize="none"
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value.replace(/#/g, ""))}
        // Enter commits the tag instead of submitting the save. A half-typed tag should
        // never be the thing that triggers the save, the same guard ListPicker's
        // new-list field uses.
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            addTag(draft);
          } else if (e.key === "Backspace" && !draft && tags.length > 0) {
            removeTag(tags[tags.length - 1]);
          }
        }}
        onBlur={() => addTag(draft)}
      />

      {/* One line, not mobile's two: every pixel here comes out of the list picker's. */}
      <p className="text-xs text-muted">No # needed. Tags save in lowercase.</p>
    </div>
  );
}
