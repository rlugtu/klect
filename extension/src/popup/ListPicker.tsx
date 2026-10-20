import { useMemo, useState } from "react";

import { saveTargets, type ListOption } from "@/shared/api-types";
import { inputClass } from "./ui";

/** Above this many save targets the picker grows a filter box. */
const SEARCH_THRESHOLD = 6;

const NAME_MAX = 30;

type Props = {
  /** `null` while `lists.mine` is still in flight. */
  lists: ListOption[] | null;
  selectedIds: string[];
  onToggle: (id: string) => void;
  newListNames: string[];
  onAddNewList: (name: string) => void;
  onRemoveNewList: (name: string) => void;
  newListsPublic: boolean;
  onToggleNewListsPublic: (value: boolean) => void;
  disabled?: boolean;
};

/**
 * Multi-select list picker with inline new-list creation.
 *
 * Only shows lists the user can actually save into — `saveTargets` drops VIEWER
 * memberships and, critically, **locked** lists. A locked list is frozen by the
 * monetization build's downgrade flow: the server refuses writes into one and the free
 * cap ignores its contents, so offering it would let a free user pile up bookmarks the cap
 * never sees. Excluded, not disabled, matching web's own picker.
 *
 * New lists are collected as **names** and handed to `bookmarks.createInLists`, which
 * creates them inside the same mutation that writes the bookmark. Calling `lists.create`
 * separately would check the list cap and the bookmark cap against two different moments
 * and could leave an orphan list behind when the second call is the one that gets refused.
 */
export function ListPicker({
  lists,
  selectedIds,
  onToggle,
  newListNames,
  onAddNewList,
  onRemoveNewList,
  newListsPublic,
  onToggleNewListsPublic,
  disabled,
}: Props) {
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");

  // `lists.mine` already returns the user's personal (`position`) order — never re-sort.
  const targets = useMemo(() => (lists ? saveTargets(lists) : null), [lists]);

  const visible = useMemo(() => {
    if (!targets) return null;
    const q = search.trim().toLowerCase();
    return q ? targets.filter((l) => l.name.toLowerCase().includes(q)) : targets;
  }, [targets, search]);

  function commitDraft() {
    const name = draft.trim();
    if (name) onAddNewList(name);
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">Add to lists</p>

      {targets && targets.length > SEARCH_THRESHOLD ? (
        <input
          type="search"
          className={inputClass}
          placeholder="Search your lists"
          aria-label="Search your lists"
          value={search}
          disabled={disabled}
          onChange={(e) => setSearch(e.target.value)}
        />
      ) : null}

      <div className="max-h-44 overflow-y-auto rounded-skin-sm border border-border">
        {visible === null ? (
          // Loading. The rest of the popup is already usable, so this stays a quiet line
          // rather than a spinner that implies the whole surface is blocked.
          <p className="px-3 py-3 text-sm text-muted">Loading your lists…</p>
        ) : visible.length === 0 ? (
          <p className="px-3 py-3 text-sm text-muted">
            {targets && targets.length === 0
              ? "No lists you can add to yet — create one below."
              : "No lists match your search."}
          </p>
        ) : (
          <ul>
            {visible.map((list) => {
              const checked = selectedIds.includes(list.id);
              return (
                <li key={list.id} className="border-b border-border last:border-b-0">
                  <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2.5">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--klect-primary)]"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => onToggle(list.id)}
                    />
                    <span aria-hidden="true">{list.icon}</span>
                    <span className="min-w-0 flex-1 truncate text-sm">{list.name}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {newListNames.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {newListNames.map((name) => (
            <li key={name}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onRemoveNewList(name)}
                aria-label={`Remove the new list ${name}`}
                className="flex items-center gap-1.5 rounded-skin-sm border border-primary bg-primary/20 px-2 py-1 text-xs text-ink"
              >
                <span className="max-w-32 truncate">{name}</span>
                <span className="text-muted">new ✕</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <input
        type="text"
        className={inputClass}
        placeholder="Or create a new list — type a name"
        aria-label="Create a new list"
        value={draft}
        maxLength={NAME_MAX}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        // Enter commits the name instead of submitting the save — a half-typed list name
        // should never become a bookmark. Blur commits too, so a name typed and then
        // clicked away from isn't silently dropped.
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitDraft();
          }
        }}
        onBlur={commitDraft}
      />

      {newListNames.length > 0 ? (
        <label className="flex items-start gap-2 text-xs text-muted">
          <input
            type="checkbox"
            className="mt-0.5 size-3.5 accent-[var(--klect-primary)]"
            checked={newListsPublic}
            disabled={disabled}
            onChange={(e) => onToggleNewListsPublic(e.target.checked)}
          />
          <span>
            Make {newListNames.length === 1 ? "the new list" : "new lists"} public (anyone
            can view). Off = private.
          </span>
        </label>
      ) : null}
    </div>
  );
}
