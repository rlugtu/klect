/**
 * The API origin, threaded in at build time (see vite.config.ts) so the manifest's
 * `host_permissions` and every request URL come from one value.
 */
export const API_URL = import.meta.env.VITE_API_URL;

/** Cookie-lookup domain for the session read. Same origin the host permission grants. */
export const API_HOSTNAME = new URL(API_URL).hostname;

/** Where a signed-out user goes to get a session this extension can read. */
export const SIGN_IN_URL = `${new URL(API_URL).origin}/login`;

/** Human-readable origin, for the signed-out copy ("sign in at klect.app"). */
export const API_LABEL = API_HOSTNAME;

/**
 * Protocols the active tab must use for its URL to be saveable. A `chrome://` page, the
 * New Tab page, a `file://` path, or another extension's page has nothing the server can
 * unfurl, so the popup says so rather than submitting garbage.
 */
const SAVEABLE_PROTOCOLS = ["http:", "https:"];

export function isSaveableUrl(url: string | undefined): url is string {
  if (!url) return false;
  try {
    return SAVEABLE_PROTOCOLS.includes(new URL(url).protocol);
  } catch {
    return false;
  }
}
