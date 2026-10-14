/**
 * Parks an invite-link token that arrived while the app was still behind the session gate.
 *
 * A universal link (`https://klect.vercel.app/invite/<token>`) can land on a cold start, or on
 * an app sitting on the login / onboarding screen. In those states `_layout.tsx` renders
 * `<LoginScreen />` / `<OnboardingScreen />` instead of the navigator, so expo-router has no
 * mounted stack to route the link into and the invite is silently dropped. The root layout
 * hands the URL here while the gate is up, and the authenticated stack takes it back on mount.
 *
 * Module-level (not secure-store): the window is one app session, and a token parked across a
 * cold restart would reopen an invite the user already walked away from.
 */
let pendingToken: string | null = null;

/** The invite token in a Klect link (universal link or `klect://`), or null for any other URL. */
export function inviteTokenFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const token = url.match(/\/invite\/([^/?#]+)/)?.[1];
  return token ? decodeURIComponent(token) : null;
}

/** Park the invite token from `url`, if it carries one. Non-invite URLs are ignored. */
export function rememberPendingInvite(url: string | null | undefined) {
  const token = inviteTokenFromUrl(url);
  if (token) pendingToken = token;
}

/** Read and clear the parked token, so it's only ever opened once. */
export function takePendingInvite(): string | null {
  const token = pendingToken;
  pendingToken = null;
  return token;
}
