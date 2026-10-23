import type {
  BookmarkData,
  CreateInListsResult,
  ListOption,
  MetadataResult,
} from "./api-types";
import type { FreeLimit } from "./free-limit";

/**
 * The popup↔worker protocol.
 *
 * The popup never calls `fetch` against the API. **Every** network call originates in the
 * background service worker, because MV3 extension pages are exempt from page-level CORS
 * for origins in `host_permissions` while `/api/trpc` has no CORS configuration at all.
 * The popup therefore talks only to the worker, over `chrome.runtime.sendMessage`.
 *
 * Responses are **plain serializable objects**, never thrown errors: `sendMessage` does a
 * JSON round-trip, so a `TRPCClientError` would arrive as `{}` and its `data.freeLimit`
 * (the only honest cap-hit signal) would be lost. The worker reads the refusal off the
 * live error and puts it on the wire itself.
 */

export type Request =
  | { type: "auth/status" }
  | { type: "lists/mine" }
  | { type: "metadata/fetch"; url: string }
  | {
      type: "bookmarks/createInLists";
      existingListIds: string[];
      newListNames: string[];
      newListsPublic: boolean;
      data: BookmarkData;
    };

export type Failure = {
  ok: false;
  /** Reportable message. Display copy only — never branch on it. */
  error: string;
  /** No session cookie in the browser: the UI shows its signed-out state. */
  signedOut?: boolean;
  /** A free-tier cap refusal, read off `error.data.freeLimit` by the worker. */
  freeLimit?: FreeLimit;
};

export type Result<T> = { ok: true; data: T } | Failure;

export type ResponseFor<R extends Request> = R extends { type: "auth/status" }
  ? Result<{ signedIn: boolean }>
  : R extends { type: "lists/mine" }
    ? Result<ListOption[]>
    : R extends { type: "metadata/fetch" }
      ? Result<MetadataResult>
      : R extends { type: "bookmarks/createInLists" }
        ? Result<CreateInListsResult>
        : never;

/**
 * Send a request to the worker. The worker is always alive to receive one (Chrome wakes a
 * stopped MV3 worker on an incoming message), but a crashed worker or a torn-down popup
 * surfaces as a rejected promise, so the caller still has to handle failure.
 */
export async function send<R extends Request>(request: R): Promise<ResponseFor<R>> {
  return (await chrome.runtime.sendMessage(request)) as ResponseFor<R>;
}

/**
 * Same as `send()`, but gives up waiting after `ms` and resolves to a failure response
 * instead of hanging.
 *
 * This is **not** a true cancel: `chrome.runtime.sendMessage` takes no `AbortSignal` and
 * the worker's `sendResponse` channel has no withdraw hook, so if the worker is still
 * alive and working, the real request keeps running after this resolves (any state it was
 * going to set, like a server-side cache, still gets set). The case this genuinely
 * protects against is MV3 killing the background worker mid-flight: `sendResponse` then
 * never fires, `send()` alone hangs forever with no recovery, and the popup's spinner can
 * never clear. This at least releases the UI.
 *
 * A late real response is discarded, not applied. `Promise.race` simply never hands the
 * loser's value to the caller, which is what we want here: nothing should retro-fill
 * fields the user was already told had failed to load.
 */
export async function sendWithin<R extends Request>(
  request: R,
  ms: number,
  timeoutMessage: string,
): Promise<ResponseFor<R>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<ResponseFor<R>>((resolve) => {
    timer = setTimeout(() => {
      // `Failure` is an arm of every `ResponseFor<R>` union (`Result<T>` is
      // `{ ok: true; data: T } | Failure`), but TypeScript cannot prove that while `R` is
      // still generic and the conditional type is unresolved. The cast is sound given
      // that invariant; it is written through `Failure` so the literal is still checked.
      const failure: Failure = { ok: false, error: timeoutMessage };
      resolve(failure as ResponseFor<R>);
    }, ms);
  });
  return Promise.race([send(request), timeout]).finally(() => clearTimeout(timer));
}
