import { toListOptions } from "@/shared/api-types";
import { freeLimitFrom } from "@/shared/free-limit";
import type { Failure, Request, Result } from "@/shared/messages";

import { trpc } from "./api";
import { isSignedIn, readSessionToken } from "./auth";

/**
 * The background service worker: the extension's only network caller, and the only module
 * that touches the session cookie.
 *
 * It is a message router and nothing more — no UI state, no caching. Every handler
 * resolves auth freshly (the tRPC client re-reads the cookie per request), so the worker
 * being stopped and restarted between popup opens, which MV3 does freely, changes nothing.
 */

/** A thrown error turned into reportable display copy. Never branched on. */
function messageFor(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong talking to Klect.";
}

/**
 * Turn a thrown tRPC error into the wire failure.
 *
 * Reads a cap refusal off `error.data.freeLimit` — the structured signal — and never off
 * the message text. The popup has no tRPC client, and `sendMessage`'s JSON round-trip
 * would flatten a thrown `TRPCClientError` to `{}`, so this is where the refusal has to
 * be lifted out of the live error.
 */
function failureFor(error: unknown): Failure {
  const freeLimit = freeLimitFrom(error);
  return {
    ok: false,
    error: messageFor(error),
    ...(freeLimit ? { freeLimit } : {}),
  };
}

const SIGNED_OUT: Failure = {
  ok: false,
  signedOut: true,
  error: "No Klect session in this browser.",
};

async function handle(request: Request): Promise<Result<unknown>> {
  switch (request.type) {
    case "auth/status":
      return { ok: true, data: { signedIn: await isSignedIn() } };

    case "lists/mine": {
      // Checked before the call rather than inferring it from a 401, so a signed-out user
      // gets the "sign in" state instead of a generic failure.
      if (!(await readSessionToken())) return SIGNED_OUT;
      try {
        return { ok: true, data: toListOptions(await trpc.lists.mine.query()) };
      } catch (error) {
        return failureFor(error);
      }
    }

    case "metadata/fetch": {
      // A query that hits **paid** third-party APIs (LinkPreview/Microlink plus an
      // Anthropic comprehension pass), so the popup fires it once per open and never per
      // keystroke. Nothing here rate-limits it; that discipline lives in the caller.
      if (!(await readSessionToken())) return SIGNED_OUT;
      try {
        return { ok: true, data: await trpc.metadata.fetch.query({ url: request.url }) };
      } catch (error) {
        return failureFor(error);
      }
    }

    case "bookmarks/createInLists": {
      if (!(await readSessionToken())) return SIGNED_OUT;
      try {
        return {
          ok: true,
          data: await trpc.bookmarks.createInLists.mutate({
            existingListIds: request.existingListIds,
            newListNames: request.newListNames,
            newListsPublic: request.newListsPublic,
            data: request.data,
          }),
        };
      } catch (error) {
        return failureFor(error);
      }
    }
  }
}

/**
 * `onMessage` must return a literal `true` to keep the response channel open for an async
 * handler — returning the promise itself does not work in Chrome. A rejected handler is
 * answered rather than left hanging, so the popup never waits forever.
 */
chrome.runtime.onMessage.addListener((request: Request, _sender, sendResponse) => {
  handle(request).then(sendResponse, (error: unknown) => sendResponse(failureFor(error)));
  return true;
});
