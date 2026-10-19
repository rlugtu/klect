/**
 * Pure helpers for desktop multi-select over an ordered set of ids (the cards
 * currently on screen, in on-screen order). No React here, so the rules are
 * plain to read and test.
 */

/** Add `id` if absent, remove it if present. */
export function toggleId(selected: string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
}

/**
 * Shift-click: add every id from `anchor` to `id` (inclusive, either direction)
 * in `order`. Without a usable anchor (none yet, or it is no longer on screen)
 * this behaves like selecting just `id`. Adds only, never removes, matching how
 * file managers extend a selection.
 */
export function selectRange(
  selected: string[],
  order: string[],
  anchor: string | null,
  id: string,
): string[] {
  const to = order.indexOf(id);
  const from = anchor ? order.indexOf(anchor) : -1;
  if (to === -1) return selected;
  if (from === -1) return selected.includes(id) ? selected : [...selected, id];
  const [lo, hi] = from <= to ? [from, to] : [to, from];
  const next = new Set(selected);
  for (const v of order.slice(lo, hi + 1)) next.add(v);
  return [...next];
}

/** `selected` narrowed to ids still in `order`, in on-screen order. */
export function visibleSelection(selected: string[], order: string[]): string[] {
  const s = new Set(selected);
  return order.filter((id) => s.has(id));
}
