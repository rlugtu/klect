import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import {
  EMPTY_BOOKMARK,
  type BookmarkData,
  type ListOption,
} from "@/shared/api-types";
import { API_LABEL, SIGN_IN_URL, isSaveableUrl } from "@/shared/env";
import { capHitMessage, type FreeLimit } from "@/shared/free-limit";
import { send } from "@/shared/messages";
import { ListPicker } from "./ListPicker";
import { RatingInput } from "./RatingInput";
import { TagInput } from "./TagInput";
import {
  Button,
  ErrorLine,
  Field,
  FieldGroup,
  Frame,
  Notice,
  inputClass,
  openTab,
} from "./ui";

/** What the popup resolved about this open. Decided once, on mount. */
type Boot =
  | { kind: "resolving" }
  | { kind: "signedOut" }
  | { kind: "unsaveable" }
  | { kind: "ready"; url: string; title: string };

/**
 * The metadata-derived fields the popup carries but does not surface as inputs. Kept as a
 * complete object rather than a partial so the save below spreads real values for every
 * field — `bookmarkInput` is a full zod object, and a missing key is a validation error.
 *
 * `tagNames` used to live here. It doesn't any more: tags are an input now, so the
 * metadata's tags seed that input (where the user can see and edit them) instead of riding
 * along invisibly and overwriting whatever the user typed when the spread lands.
 */
type Enrichment = Pick<
  BookmarkData,
  "images" | "videoUrl" | "videoType" | "location" | "latitude" | "longitude"
>;

const NO_ENRICHMENT: Enrichment = {
  images: [],
  videoUrl: "",
  videoType: "",
  location: "",
  latitude: null,
  longitude: null,
};

/**
 * The save-the-current-page popup.
 *
 * Every open is a cold mount. The sequence is deliberately: resolve auth + the active tab
 * together (both are local reads), paint the form with the tab's own title, and only then
 * fan out to the two network calls — the list fetch and the metadata enrichment — neither
 * of which blocks the UI or each other. `metadata.fetch` hits **paid** third-party APIs
 * server-side, so it fires exactly once per open and never on a keystroke.
 */
export function App() {
  const [boot, setBoot] = useState<Boot>({ kind: "resolving" });

  const [lists, setLists] = useState<ListOption[] | null>(null);
  const [listsError, setListsError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  // Enrichment lands after the user can already type, so it must not clobber hand-edits.
  // Same guard mobile's non-blocking `autofillOnMount` path uses. Notes and rating need no
  // guard: `metadata.fetch` has no opinion about either, so nothing can arrive and clobber.
  const nameDirty = useRef(false);
  const descDirty = useRef(false);
  const tagsDirty = useRef(false);

  const [enrichment, setEnrichment] = useState<Enrichment>(NO_ENRICHMENT);
  const [enriching, setEnriching] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [newListNames, setNewListNames] = useState<string[]>([]);
  const [newListsPublic, setNewListsPublic] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [capHit, setCapHit] = useState<{ limit: FreeLimit; adding: number } | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  const loadLists = useCallback(async () => {
    const res = await send({ type: "lists/mine" });
    if (res.ok) {
      setLists(res.data);
      return;
    }
    if (res.signedOut) {
      setBoot({ kind: "signedOut" });
      return;
    }
    setLists([]);
    setListsError(res.error);
  }, []);

  const enrich = useCallback(async (url: string) => {
    setEnriching(true);
    const res = await send({ type: "metadata/fetch", url });
    setEnriching(false);
    if (!res.ok) {
      if (res.signedOut) setBoot({ kind: "signedOut" });
      else setEnrichError(res.error);
      return;
    }
    // `metadata.fetch` answers with its own ok/error envelope — an unfurl that failed is a
    // normal outcome (a login wall, a dead link), not a transport failure.
    if (!res.data.ok) {
      setEnrichError(res.data.error);
      return;
    }
    const meta = res.data.data;
    // Fill only what the user hasn't touched — this lands after the form is live.
    if (meta.title && !nameDirty.current) setName(meta.title);
    if (meta.description && !descDirty.current) setDescription(meta.description);
    // Suggested tags fill the chip list only while it's still untouched. Mobile's rule for
    // the same field: "Tags fill only when still empty, never overwrite what's there".
    if (meta.tags.length > 0 && !tagsDirty.current) setTags(meta.tags);
    setEnrichment({
      images: meta.images,
      videoUrl: meta.video?.url ?? "",
      videoType: meta.video?.type ?? "",
      location: meta.location ?? "",
      latitude: meta.latitude,
      longitude: meta.longitude,
    });
  }, []);

  // Guarded against React StrictMode's double effect invocation: a second
  // `metadata.fetch` would be a second paid third-party call per popup open.
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;

    void (async () => {
      const [auth, tabs] = await Promise.all([
        send({ type: "auth/status" }),
        // `activeTab` grants this on the popup's user-gesture open — no `tabs` permission.
        chrome.tabs.query({ active: true, currentWindow: true }),
      ]);

      if (!auth.ok || !auth.data.signedIn) {
        setBoot({ kind: "signedOut" });
        return;
      }

      const tab = tabs[0];
      if (!isSaveableUrl(tab?.url)) {
        setBoot({ kind: "unsaveable" });
        return;
      }

      const title = tab?.title?.trim() ?? "";
      setName(title);
      setBoot({ kind: "ready", url: tab.url, title });

      // Fan out. Neither call blocks the other, and the form is already usable.
      void loadLists();
      void enrich(tab.url);
    })();
  }, [enrich, loadLists]);

  const targetCount = selectedIds.length + newListNames.length;

  /**
   * How many rows the refused save would have created — what `capHitMessage` needs to say
   * "you'd need N more" honestly. Mirrors `core.createBookmarkInLists`: only new lists
   * consume list capacity, while bookmark capacity is consumed by every target the user
   * **owns** plus those new lists (copies into someone else's list are collaboration and
   * never charged to the adder).
   */
  function addingFor(limit: FreeLimit): number {
    const ownedExisting = selectedIds.filter((id) =>
      (lists ?? []).some((l) => l.id === id && l.role === "OWNER"),
    ).length;
    return limit.limit === "lists"
      ? newListNames.length
      : ownedExisting + newListNames.length;
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (boot.kind !== "ready" || saving) return;
    if (targetCount === 0) {
      setSaveError("Pick at least one list for the bookmark.");
      return;
    }

    setSaveError(null);
    setSaving(true);

    // Every field the user left alone keeps its `EMPTY_BOOKMARK` value (`notes: ""`,
    // `rating: 0`, `tagNames: []`), all of which `bookmarkInput` accepts, so a blank
    // rating or an empty tag list is a normal save and never a reason to refuse one.
    // (`rating: 0` satisfies `multipleOf(0.5)`; `core.createBookmark` drops empty
    // tag names and treats an empty array as "no tags".)
    const data: BookmarkData = {
      ...EMPTY_BOOKMARK,
      ...enrichment,
      // Never save a nameless bookmark: fall back to the tab's title, then the URL itself.
      name: name.trim() || boot.title || boot.url,
      description: description.trim(),
      notes: notes.trim(),
      rating,
      tagNames: tags,
      urls: [boot.url],
    };

    const res = await send({
      type: "bookmarks/createInLists",
      existingListIds: selectedIds,
      newListNames,
      newListsPublic,
      data,
    });
    setSaving(false);

    if (res.ok) {
      setSavedCount(res.data.targetIds.length);
      return;
    }
    if (res.signedOut) {
      setBoot({ kind: "signedOut" });
      return;
    }
    // Structured cap refusal off `error.data.freeLimit`, never the message text.
    if (res.freeLimit) {
      setCapHit({ limit: res.freeLimit, adding: addingFor(res.freeLimit) });
      return;
    }
    setSaveError(res.error);
  }

  if (boot.kind === "resolving") {
    return (
      <Frame>
        <p className="py-6 text-center text-sm text-muted">Checking your Klect session…</p>
      </Frame>
    );
  }

  if (boot.kind === "signedOut") {
    return (
      <Frame>
        <Notice title="You're not signed in">
          <p className="text-sm text-muted">
            This extension uses the Klect session already in this browser. Sign in at{" "}
            {API_LABEL} and reopen the popup.
          </p>
          <Button onClick={() => openTab(SIGN_IN_URL)}>Sign in at {API_LABEL}</Button>
        </Notice>
      </Frame>
    );
  }

  if (boot.kind === "unsaveable") {
    return (
      <Frame>
        <Notice title="Nothing to save here">
          <p className="text-sm text-muted">
            This page has no web address Klect can save — browser pages, the New Tab page,
            and local files can&apos;t be bookmarked. Open a site and try again.
          </p>
        </Notice>
      </Frame>
    );
  }

  if (capHit) {
    // Stated plainly and left here. Opening `/upgrade` in a tab is Stage 4's polish; a
    // dead end with the honest numbers beats a half-built paywall in a 380px popup.
    return (
      <Frame>
        <Notice title="You've hit your free plan limit">
          <p className="text-sm text-muted">{capHitMessage(capHit.limit, capHit.adding)}</p>
          <p className="text-sm text-muted">
            Nothing was saved. Upgrade at {API_LABEL} to keep going.
          </p>
        </Notice>
      </Frame>
    );
  }

  if (savedCount !== null) {
    return (
      <Frame>
        <Notice title={`Saved to ${savedCount} ${savedCount === 1 ? "list" : "lists"}`}>
          <p className="text-sm text-muted">{name.trim() || boot.title || boot.url}</p>
          <Button variant="quiet" onClick={() => window.close()}>
            Done
          </Button>
        </Notice>
      </Frame>
    );
  }

  return (
    <Frame>
      <form className="flex flex-col gap-4" onSubmit={handleSave}>
        <Field
          label="Name"
          htmlFor="bookmark-name"
          hint={enriching ? "Fetching the page's details…" : undefined}
        >
          <input
            id="bookmark-name"
            type="text"
            className={inputClass}
            value={name}
            placeholder={boot.title || boot.url}
            disabled={saving}
            onChange={(e) => {
              nameDirty.current = true;
              setName(e.target.value);
            }}
          />
        </Field>

        <Field label="Description" htmlFor="bookmark-description">
          <textarea
            id="bookmark-description"
            rows={3}
            className={`${inputClass} resize-none`}
            value={description}
            placeholder="Optional"
            disabled={saving}
            onChange={(e) => {
              descDirty.current = true;
              setDescription(e.target.value);
            }}
          />
        </Field>

        <Field label="Notes" htmlFor="bookmark-notes">
          <textarea
            id="bookmark-notes"
            rows={2}
            className={`${inputClass} resize-none`}
            value={notes}
            // Said plainly, because "Description" and "Notes" next to each other is an
            // honest question. Matches what the fields are for in web's own editor:
            // description describes the page, notes are yours about it.
            placeholder="Optional: your own note, not the page's"
            disabled={saving}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        <p className="truncate text-xs text-muted" title={boot.url}>
          {boot.url}
        </p>

        <FieldGroup label="Rating">
          <RatingInput value={rating} onChange={setRating} disabled={saving} />
        </FieldGroup>

        <Field label="Tags" htmlFor="bookmark-tags">
          <TagInput
            inputId="bookmark-tags"
            tags={tags}
            onChange={(next) => {
              tagsDirty.current = true;
              setTags(next);
            }}
            disabled={saving}
          />
        </Field>

        <ListPicker
          lists={lists}
          selectedIds={selectedIds}
          onToggle={(id) =>
            setSelectedIds((prev) =>
              prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
            )
          }
          newListNames={newListNames}
          onAddNewList={(newName) =>
            setNewListNames((prev) => (prev.includes(newName) ? prev : [...prev, newName]))
          }
          onRemoveNewList={(newName) =>
            setNewListNames((prev) => prev.filter((x) => x !== newName))
          }
          newListsPublic={newListsPublic}
          onToggleNewListsPublic={setNewListsPublic}
          disabled={saving}
        />

        {listsError ? <ErrorLine>Couldn&apos;t load your lists: {listsError}</ErrorLine> : null}
        {enrichError ? (
          <p className="text-xs text-muted">
            Couldn&apos;t auto-fill from the page ({enrichError}). Saving still works.
          </p>
        ) : null}
        {saveError ? <ErrorLine>{saveError}</ErrorLine> : null}

        {/* Pinned to the bottom of the scrollport. Three more fields pushed the form past
            the 600px Chrome allows a popup, and a Save button you have to scroll to find
            is a worse bug than the one this row solves. Full content width with an opaque
            background so the form passes cleanly behind it; no negative margins, because
            the body's `overflow-y-auto` also makes overflow-x auto and anything wider
            than the content box would grow a horizontal scrollbar. */}
        <div className="sticky bottom-0 flex flex-col border-t border-border bg-bg pt-3 pb-1">
          <Button type="submit" disabled={saving || targetCount === 0}>
            {saving ? "Saving…" : "Save bookmark"}
          </Button>
        </div>
      </form>
    </Frame>
  );
}
