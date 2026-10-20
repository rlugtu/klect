import { API_HOSTNAME } from "@/shared/env";

/**
 * Resolving the session token from the browser's own cookie jar.
 *
 * Validated end-to-end against the real production backend (Stage 1 of
 * `IMPLEMENTATION_PLAN.md`; recorded in `mobile/docs/ARCHITECTURE.md`'s Auth section).
 * The shape of it:
 *
 * - `chrome.cookies.getAll` can read better-auth's **`httpOnly`** session cookie. The
 *   `cookies` permission is exempt from the `document.cookie` restriction a page faces.
 * - The cookie's value is passed through **whole and unmodified** as
 *   `Authorization: Bearer <value>`. Do not split it on the `.`: better-auth's `bearer()`
 *   plugin treats a dotted value as the signed cookie, HMAC-verifies
 *   `<token>.<signature>` against `BETTER_AUTH_SECRET`, and re-injects it as a request
 *   cookie before `auth.api.getSession()` runs. Same header mobile sends, same plugin
 *   accepting it, zero server changes.
 * - The cookie **name is environment-dependent** and must be matched by suffix:
 *   `__Secure-better-auth.session_token` in production (confirmed) and
 *   `better-auth.session_token` on `http://localhost` dev, because
 *   `web/src/lib/auth.ts` overrides neither `advanced.cookiePrefix` nor
 *   `useSecureCookies`, so better-auth's own prefix defaults decide. Hardcoding either
 *   name breaks the other environment. This is the same suffix match
 *   `sessionTokenFromCookie` in `mobile/src/client/auth.ts` already uses.
 *
 * The token is **never cached**. The source is a live local cookie read, which is cheap,
 * so re-reading per request makes a server-side rotation or a sign-out in another tab a
 * non-event instead of a staleness bug a later stage has to go fix.
 */

const SESSION_COOKIE_SUFFIX = "session_token";

/**
 * The session token, or null when the browser has no Klect session.
 *
 * `getAll({ domain })` also matches subdomains, and both the `__Secure-`-prefixed and
 * bare names can coexist in one profile (a dev session and a prod session side by side),
 * so when there is more than one candidate the `__Secure-` cookie wins — it is the one a
 * production host set, and this build pins a single production domain.
 */
export async function readSessionToken(): Promise<string | null> {
  const cookies = await chrome.cookies.getAll({ domain: API_HOSTNAME });

  const candidates = cookies.filter(
    (c) => c.name.endsWith(SESSION_COOKIE_SUFFIX) && c.value !== "",
  );
  if (candidates.length === 0) return null;

  const preferred =
    candidates.find((c) => c.name.startsWith("__Secure-")) ?? candidates[0];
  return preferred.value;
}

/** Whether the browser currently holds a Klect session the extension can use. */
export async function isSignedIn(): Promise<boolean> {
  return (await readSessionToken()) !== null;
}
