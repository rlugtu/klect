/**
 * Render a stored handle as its public `@handle` label. The `@` is display-only
 * (never stored). Falls back to "Someone" when a handle is somehow absent (e.g. a
 * legacy row that hasn't picked one yet). Safe in client + server components.
 */
export function atHandle(handle: string | null | undefined): string {
  return handle ? `@${handle}` : "Someone";
}
