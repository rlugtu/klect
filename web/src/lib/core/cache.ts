import "server-only";

/**
 * Tiny in-memory TTL cache with in-flight coalescing, used to dedupe autofill
 * work by URL. Two effects:
 *   - repeat hits within the TTL return the stored value (no upstream call);
 *   - concurrent identical calls share one execution (handles double-taps and the
 *     standalone "add to several lists" fan-out).
 *
 * This is per-process and ephemeral — on serverless it lives only for a warm
 * instance's lifetime and isn't shared across instances. Accepted tradeoff (no
 * new infra); the coalescing + warm-instance repeat-hit wins still hold.
 */

type Entry = { value: unknown; expiresAt: number };

const MAX_ENTRIES = 500;
const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();

  const hit = store.get(key);
  if (hit && hit.expiresAt > now) return hit.value as T;

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const p = (async () => {
    try {
      const value = await fn();
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      evict();
      return value;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, p);
  return p as Promise<T>;
}

/** Bound the map: drop expired entries, then FIFO-evict down to the cap. */
function evict(): void {
  if (store.size <= MAX_ENTRIES) return;
  const now = Date.now();
  for (const [k, v] of store) {
    if (v.expiresAt <= now) store.delete(k);
  }
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}
