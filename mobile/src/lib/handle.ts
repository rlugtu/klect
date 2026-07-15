/**
 * Render a stored handle as its public `@handle` label. The `@` is display-only
 * (never stored), mirroring how tags render as `#hashtags`. Falls back to
 * "Someone" when a handle is absent.
 */
export function atHandle(handle: string | null | undefined): string {
  return handle ? `@${handle}` : 'Someone';
}
