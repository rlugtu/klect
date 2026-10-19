/**
 * Small fuzzy matcher for the command palette. Pure and dependency-free.
 *
 * Returns a score (higher is better) or null when `query` does not match
 * `text`. Tiers, best first: exact match, prefix, a word starting with the
 * query, a plain substring, then a subsequence (every query character appears
 * in order, e.g. "jcc" in "Jersey City Coffee"), where consecutive runs and
 * word-start hits score higher. Case-insensitive; surrounding whitespace in the
 * query is ignored. An empty query matches everything with score 0.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = text.toLowerCase();

  if (t === q) return 1000;
  if (t.startsWith(q)) return 900 - Math.min(t.length - q.length, 100);
  const wordStart = t.search(new RegExp(`(^|[^a-z0-9])${escapeRegExp(q)}`));
  if (wordStart >= 0) return 800 - Math.min(wordStart, 100);
  const sub = t.indexOf(q);
  if (sub >= 0) return 700 - Math.min(sub, 100);

  // Subsequence: walk the text once, greedily matching query characters.
  let score = 0;
  let qi = 0;
  let prev = -2;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] !== q[qi]) continue;
    const atWordStart = i === 0 || !/[a-z0-9]/.test(t[i - 1]);
    score += 10 + (i === prev + 1 ? 15 : 0) + (atWordStart ? 20 : 0);
    prev = i;
    qi++;
  }
  if (qi < q.length) return null;
  // Stay below every substring-tier score, and prefer shorter texts.
  return Math.min(600, score) - Math.min(t.length, 100) / 10;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * `items` that match `query`, best first (ties keep their original order).
 * `text` picks the string to match; `limit` caps the result.
 */
export function fuzzyFilter<T>(
  items: readonly T[],
  query: string,
  text: (item: T) => string,
  limit = Infinity,
): T[] {
  if (!query.trim()) return items.slice(0, limit);
  return items
    .map((item, index) => ({ item, index, score: fuzzyScore(query, text(item)) }))
    .filter((r): r is { item: T; index: number; score: number } => r.score !== null)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((r) => r.item);
}
