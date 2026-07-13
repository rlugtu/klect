"use client";

import { useMemo, useState } from "react";
import { PixelInput } from "@/components/ui/PixelInput";
import { PixelTextarea } from "@/components/ui/PixelTextarea";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { PixelBadge } from "@/components/ui/PixelBadge";

/** A list bookmark offered as a poll option. */
export type PollOptionBookmark = {
  id: string;
  name: string;
  image: string | null;
  tags: { id: string; name: string; color: string }[];
};

export type PollFormDefaults = {
  name: string;
  description: string;
  startAt: Date | string;
  endAt: Date | string | null;
  maxVotes: number | null;
  revotesAllowed: boolean;
  bookmarkIds: string[];
};

/** Format a Date (or ISO string) as a `datetime-local` value in local time. */
function toLocalInput(value: Date | string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function PollForm({
  action,
  bookmarks,
  submitLabel,
  defaults,
  showAnonymous = false,
}: {
  action: (formData: FormData) => void | Promise<void>;
  bookmarks: PollOptionBookmark[];
  submitLabel: string;
  defaults?: PollFormDefaults;
  // Only the create flow offers this — anonymity is fixed once a poll exists.
  showAnonymous?: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(defaults?.bookmarkIds ?? []),
  );
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const availableTags = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color: string }>();
    for (const b of bookmarks) for (const tag of b.tags) map.set(tag.id, tag);
    return [...map.values()];
  }, [bookmarks]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bookmarks.filter(
      (b) =>
        (q === "" || b.name.toLowerCase().includes(q)) &&
        (tagFilter.size === 0 || b.tags.some((t) => tagFilter.has(t.id))),
    );
  }, [bookmarks, query, tagFilter]);

  const allShownSelected =
    shown.length > 0 && shown.every((b) => selected.has(b.id));

  function toggle(set: Set<string>, id: string): Set<string> {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }

  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allShownSelected) shown.forEach((b) => next.delete(b.id));
      else shown.forEach((b) => next.add(b.id));
      return next;
    });
  }

  async function handle(formData: FormData) {
    setError(null);
    if (!String(formData.get("name") ?? "").trim()) {
      setError("Poll name is required.");
      return;
    }
    if (selected.size < 2) {
      setError("Pick at least two bookmarks for the poll.");
      return;
    }
    await action(formData);
  }

  return (
    <form action={handle} className="flex flex-col gap-5">
      {/* Selected option ids ride along as repeated hidden fields. */}
      {[...selected].map((id) => (
        <input key={id} type="hidden" name="bookmarkIds" value={id} />
      ))}

      <label className="flex flex-col gap-1.5">
        <FieldLabel>Name *</FieldLabel>
        <PixelInput
          name="name"
          defaultValue={defaults?.name ?? ""}
          placeholder="What are we deciding?"
          required
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <FieldLabel>Description</FieldLabel>
        <PixelTextarea
          name="description"
          rows={3}
          defaultValue={defaults?.description ?? ""}
          placeholder="Add context (optional)"
        />
      </label>

      <div className="flex flex-wrap gap-4">
        <label className="flex flex-1 flex-col gap-1.5">
          <FieldLabel>Starts</FieldLabel>
          <PixelInput
            type="datetime-local"
            name="startAt"
            defaultValue={toLocalInput(defaults?.startAt ?? new Date())}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1.5">
          <FieldLabel>Ends (optional)</FieldLabel>
          <PixelInput
            type="datetime-local"
            name="endAt"
            defaultValue={toLocalInput(defaults?.endAt ?? null)}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-1 flex-col gap-1.5">
          <FieldLabel>Votes per participant</FieldLabel>
          <PixelInput
            type="number"
            name="maxVotes"
            min={1}
            defaultValue={defaults?.maxVotes != null ? defaults.maxVotes : ""}
            placeholder="Unlimited"
          />
        </label>
        <label className="flex cursor-pointer items-center gap-2 py-2.5">
          <input
            type="checkbox"
            name="revotesAllowed"
            defaultChecked={defaults?.revotesAllowed ?? false}
            className="accent-primary h-5 w-5"
          />
          <FieldLabel>Allow revotes</FieldLabel>
        </label>
      </div>

      {showAnonymous && (
        <div className="flex flex-col gap-1.5">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              name="anonymous"
              className="accent-primary h-5 w-5"
            />
            <FieldLabel>Anonymous poll</FieldLabel>
          </label>
          <p className="text-muted text-sm">
            Hides who voted for what. This can only be set now and can’t be
            changed later.
          </p>
        </div>
      )}

      <div className="border-border border-t-2" />

      {/* Options: pick bookmarks from the list */}
      <div className="flex items-center justify-between gap-3">
        <FieldLabel>Options *</FieldLabel>
        <span className="text-muted text-sm">{selected.size} selected</span>
      </div>

      <PixelInput
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search bookmarks"
      />

      {availableTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {availableTags.map((tag) => {
            const on = tagFilter.has(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => setTagFilter((prev) => toggle(prev, tag.id))}
              >
                <PixelBadge
                  tag
                  color={on ? tag.color || undefined : undefined}
                  className={`text-xs px-1.5 py-0.5 ${on ? "" : "opacity-60"}`}
                >
                  {tag.name}
                </PixelBadge>
              </button>
            );
          })}
        </div>
      )}

      {shown.length > 0 && (
        <button
          type="button"
          onClick={toggleSelectAll}
          className="text-primary self-start text-sm font-bold"
        >
          {allShownSelected ? "Clear shown" : `Select all (${shown.length})`}
        </button>
      )}

      {shown.length === 0 ? (
        <p className="text-muted text-sm">No bookmarks match.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((b) => {
            const on = selected.has(b.id);
            return (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => setSelected((prev) => toggle(prev, b.id))}
                  className={`pixel-box-sm flex w-full items-center gap-3 p-2 text-left ${
                    on ? "bg-primary/20 border-primary" : "bg-panel"
                  }`}
                >
                  {b.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={b.image}
                      alt=""
                      loading="lazy"
                      className="pixel-box-sm bg-panel h-10 w-10 shrink-0 object-cover"
                    />
                  ) : (
                    <span className="bg-bg grid h-10 w-10 shrink-0 place-items-center">
                      🔖
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {b.name}
                  </span>
                  {on && <span className="text-primary shrink-0">✓</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {error && <p className="text-danger text-sm">{error}</p>}

      <SubmitButton label={submitLabel} pendingLabel="Saving…" />
    </form>
  );
}
