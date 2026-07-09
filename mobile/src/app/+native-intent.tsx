import { getShareExtensionKey } from 'expo-share-intent';

/**
 * Intercepts incoming deep links before expo-router tries to match them as routes.
 *
 * When a URL is shared into Klect, the native Share Extension reopens the app via a
 * deep link like `klect://dataUrl=<ShareKey>...`. That isn't a real route, so expo-router
 * would otherwise render the "Unmatched Route" (+not-found) screen. We redirect it to `/`
 * and let `ShareIntentProvider` / `ShareIntentRouter` (in `_layout.tsx`) pick up the shared
 * payload and navigate to the new-bookmark flow.
 */
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}): string {
  try {
    if (path.includes(`dataUrl=${getShareExtensionKey()}`)) return '/';
  } catch {
    // fall through — pass non-share links (e.g. auth callbacks) untouched
  }
  return path;
}
