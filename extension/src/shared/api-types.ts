import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@web/server/trpc/router";

/**
 * The extension's whole compile-time link to the backend.
 *
 * `AppRouter` is a **type-only** import from web/src — erased at compile time, so there is
 * zero runtime coupling (the same seam mobile uses; docs/ARCHITECTURE.md §2 and §6). Every
 * request and response shape below is inferred from web's actual procedures rather than
 * hand-written, so a server-side rename fails this file's typecheck instead of silently
 * breaking a request at runtime.
 *
 * Made to compile by the three-part tsconfig path trick documented in tsconfig.json.
 */
type Inputs = inferRouterInputs<AppRouter>;
type Outputs = inferRouterOutputs<AppRouter>;

/** `lists.mine` — every list the user participates in, in their personal order. */
export type Memberships = Outputs["lists"]["mine"];

/** `metadata.fetch` — server-side autofill (extraction + comprehension, merged). */
export type MetadataResult = Outputs["metadata"]["fetch"];

/** `bookmarks.createInLists` → `{ targetIds }`. */
export type CreateInListsResult = Outputs["bookmarks"]["createInLists"];

/**
 * The exact `data` object `bookmarks.createInLists` accepts — no hand DTOs.
 * Note it is a **full** object, not a partial: every field in web's `bookmarkInput`
 * zod schema is required, which is what {@link EMPTY_BOOKMARK} exists to supply.
 */
export type BookmarkData = Inputs["bookmarks"]["createInLists"]["data"];

/**
 * Defaults for every field this lightweight popup does not surface. Mirrors mobile's
 * `EMPTY_BOOKMARK` (mobile/src/components/bookmark-form.tsx) for the same reason: the zod
 * input is a full object, so a save has to spread over a complete set of real values.
 */
export const EMPTY_BOOKMARK: BookmarkData = {
  name: "",
  description: "",
  urls: [],
  images: [],
  notes: "",
  location: "",
  latitude: null,
  longitude: null,
  rating: 0,
  visited: false,
  videoUrl: "",
  videoType: "",
  tagNames: [],
};

/**
 * The picker-relevant projection of a membership row. Deliberately not `_count` or
 * `memberships`: the popup only needs these fields, and Stage 3 persists this same shape
 * into `chrome.storage.local`, where a smaller row is a cheaper cache.
 */
export type ListOption = {
  id: string;
  name: string;
  icon: string;
  role: Memberships[number]["role"];
  /**
   * Nullish = active; a timestamp = frozen by the free-tier downgrade flow. The picker
   * must drop locked lists: the server refuses writes into one and the cap count ignores
   * its contents, so offering it as a save target would let a free user pile up bookmarks
   * the cap never sees. Always nullish-checked (`== null`), never `=== null`.
   *
   * Typed from the router, so `Date` on paper — but the router has no superjson
   * transformer, so it is an ISO **string** on the wire. Fine here: nothing formats it.
   */
  lockedAt: Memberships[number]["list"]["lockedAt"];
};

/** Project full `lists.mine` rows down to the picker-relevant fields. */
export function toListOptions(memberships: Memberships): ListOption[] {
  return memberships.map((m) => ({
    id: m.list.id,
    name: m.list.name,
    icon: m.list.icon,
    role: m.role,
    lockedAt: m.list.lockedAt,
  }));
}

/**
 * Lists this user can actually save into: COLLABORATOR or OWNER, and not locked.
 *
 * Both halves match web's own picker filter (`web/src/app/bookmarks/new/page.tsx`).
 * Excluded rather than shown-and-disabled on purpose — see {@link ListOption.lockedAt}.
 * Mobile's `list-picker.tsx` has the role half but is missing the lock half; this
 * extension filters both from its first commit rather than inherit the gap.
 */
export function saveTargets(lists: ListOption[]): ListOption[] {
  return lists.filter(
    (l) => (l.role === "OWNER" || l.role === "COLLABORATOR") && l.lockedAt == null,
  );
}
