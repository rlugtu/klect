import * as SecureStore from 'expo-secure-store';

import { trpc } from '@/client/api';
import { SHARED_KEYCHAIN_ACCESS_GROUP } from '@/client/bearer-store';

/**
 * A cached, minimal projection of the user's list memberships, small enough to live in the
 * shared keychain. The iOS Share Extension runs in a **separate, cold process** and re-fetches
 * `lists.mine` on every open; write-mirroring the picker-relevant fields here (the same App-Group
 * keychain pattern the bearer token and theme use) lets the extension hydrate the list picker
 * **instantly** from the last snapshot the app saw, then refresh in the background.
 *
 * Only the fields `ListPicker` needs are stored — not `_count`/`memberships` — both to keep the
 * keychain value well under SecureStore's size limit and because that's all the picker reads.
 */

// Inferred straight from web's tRPC procedure — no hand-written DTOs.
type Memberships = Awaited<ReturnType<typeof trpc.lists.mine.query>>;

export type ListOption = {
  id: string;
  name: string;
  icon: string;
  role: Memberships[number]['role'];
  /**
   * Nullish = active; a timestamp = frozen by the free-tier downgrade flow. Cached because
   * `ListPicker` has to drop locked lists: the server refuses writes into one, and the cap
   * count ignores a locked list's contents, so offering it as a save target would let a free
   * user pile up bookmarks the cap never sees.
   *
   * Optional because this value is *persisted*: a snapshot written before this field was
   * cached parses back with `lockedAt` undefined, and that has to read as *unlocked*
   * (treating a stale cache as locked would empty the picker for everyone who had one).
   * So every consumer nullish-checks it (`== null`) rather than comparing against `null`.
   *
   * `string`, not `Date`: the router has no superjson transformer, so `lists.mine` already
   * hands mobile an ISO string, which is also exactly what survives the JSON round-trip
   * through the keychain.
   */
  lockedAt?: string | null;
};

const SHARED_LISTS_KEY = 'klect.lists.shared';
const SHARED_OPTS = { accessGroup: SHARED_KEYCHAIN_ACCESS_GROUP } as const;

// Cap the cached snapshot so a user with a huge number of lists can't blow past the keychain
// item size limit. The picker only ever surfaces editable lists anyway; this is a safety bound,
// not a functional one, and preserves the user's own (position) ordering.
const MAX_CACHED = 60;

/** Project full `lists.mine` rows down to the picker-relevant fields. */
export function toListOptions(memberships: Memberships): ListOption[] {
  return memberships.slice(0, MAX_CACHED).map((m) => ({
    id: m.list.id,
    name: m.list.name,
    icon: m.list.icon,
    role: m.role,
    lockedAt: m.list.lockedAt,
  }));
}

/** Write-mirror the current lists into the shared keychain (best-effort; never throws). */
export function writeSharedLists(memberships: Memberships): void {
  try {
    const payload = JSON.stringify(toListOptions(memberships));
    SecureStore.setItemAsync(SHARED_LISTS_KEY, payload, SHARED_OPTS).catch(() => {});
  } catch {
    // Serialization failure — nothing to cache; the network fetch still populates the picker.
  }
}

/** Read the cached lists from the shared keychain. Returns null on any miss/parse failure. */
export async function readSharedLists(): Promise<ListOption[] | null> {
  try {
    const raw = await SecureStore.getItemAsync(SHARED_LISTS_KEY, SHARED_OPTS);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ListOption[]) : null;
  } catch {
    return null;
  }
}
