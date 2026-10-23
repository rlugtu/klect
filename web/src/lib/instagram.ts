/**
 * Deterministic reading of an Instagram post's unfurl: who posted it, when, and the
 * caption, pulled out of the og:title/og:description strings Microlink and LinkPreview
 * hand back for a reel, a carousel, or a photo post.
 *
 * Kept free of Prisma and `server-only` on purpose, like title-clean.ts: pure string
 * in, value out, so the unfurl pipeline (core/metadata.ts) and a plain `tsx` script
 * (`scripts/verify-instagram.ts`) import the one implementation.
 *
 * The bias is hard toward "not parsed". Every reader returns null on any shape it does
 * not recognize exactly, and the caller then falls back to today's generic behavior.
 * That is the contract for the post types nobody has sampled yet (location-tagged,
 * captionless, login-walled): a wrong parse would put garbage in the Name, while a
 * missed parse only leaves the old, noisier text in place.
 */

export type InstagramPost = {
  /** The account handle, without the display-only `@`. */
  handle: string;
  /** The account's display name, when the title carried one. May contain `|`. */
  displayName: string | null;
  /** The posting date as `YYYY-MM-DD`, when the description carried one. */
  date: string | null;
  likes: number | null;
  comments: number | null;
  /** The caption exactly as posted (hashtags included), outer quotes removed. */
  caption: string;
};

const INSTAGRAM_HOSTS = new Set(["instagram.com", "instagr.am"]);

/** instagram.com (any of www/m) or the instagr.am short host. */
export function isInstagramUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^(www|m)\./, "");
    return INSTAGRAM_HOSTS.has(host);
  } catch {
    return false;
  }
}

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

/** A handle as Instagram allows it: letters, digits, `.` and `_`. */
const HANDLE = "[A-Za-z0-9._]+";

/**
 * Microlink's description prefix, ahead of the quoted caption:
 * `52K likes, 7,410 comments - dr.kamui on October 5, 2026: `.
 * The separator is an ASCII hyphen; counts mix abbreviated and comma-grouped forms.
 * `[\s\S]*` for the remainder because captions carry literal newlines.
 */
const MICROLINK_PREFIX = new RegExp(
  "^\\s*([\\d.,]+[KMB]?)\\s+likes?,\\s+([\\d.,]+[KMB]?)\\s+comments?\\s+-\\s+" +
    `(${HANDLE})\\s+on\\s+([A-Za-z]+)\\s+(\\d{1,2}),\\s+(\\d{4}):\\s*([\\s\\S]*)$`,
);

/** Either curly quote or a straight one. The opener is not always U+201C. */
const QUOTES = new Set(["“", "”", '"']);

/**
 * `<display name> (@handle)`, optionally followed by Instagram's own `• Instagram reel`
 * / `• Instagram photos and videos` tail (present on the raw og:title, gone once
 * cleanTitle has run). The handle is anchored to the END, so a `|` or anything else
 * inside the display name is just part of the name and never a separator.
 */
const ACCOUNT_TITLE = new RegExp(
  `^([\\s\\S]*?)\\s*\\(@(${HANDLE})\\)(?:\\s*•\\s*Instagram\\b[^•]*)?\\s*$`,
);

/** LinkPreview's good shape: `A post shared by <display name> (@handle)`. */
const SHARED_BY = /^\s*A post shared by\s+/i;

/** `52K` → 52000, `1.2M` → 1200000, `7,410` → 7410. Null when it isn't a count. */
export function parseCount(raw: string): number | null {
  const m = /^(\d[\d,]*(?:\.\d+)?)([KMB]?)$/.exec(raw.trim());
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const scale = m[2] === "K" ? 1e3 : m[2] === "M" ? 1e6 : m[2] === "B" ? 1e9 : 1;
  return Math.round(n * scale);
}

/** `October`, `5`, `2026` → `2026-10-05`. Null for a month name we don't know. */
function isoDate(month: string, day: string, year: string): string | null {
  const mi = MONTHS.indexOf(month.toLowerCase());
  const d = Number(day);
  if (mi < 0 || d < 1 || d > 31) return null;
  return `${year}-${String(mi + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Remove the ONE outer quote pair (and Microlink's trailing `.` after the closer) by
 * position. Never by searching for the first closing quote: captions quote people
 * themselves (“Although my time in Texas was short,” Debru wrote...), so the first
 * closer is often mid-caption. Null when the body isn't quoted at all.
 */
function unquote(body: string): string | null {
  let s = body.trim();
  if (!s || !QUOTES.has(s[0])) return null;
  s = s.slice(1);
  if (s.endsWith(".")) s = s.slice(0, -1);
  if (s && QUOTES.has(s[s.length - 1])) s = s.slice(0, -1);
  return s.trim();
}

/** `{ displayName, handle }` from either og:title shape. Null when there's no `(@handle)`. */
export function parseAccountTitle(
  title: string | null | undefined,
): { displayName: string | null; handle: string } | null {
  if (!title) return null;
  const m = ACCOUNT_TITLE.exec(title.replace(SHARED_BY, ""));
  if (!m) return null;
  return { displayName: m[1].trim() || null, handle: m[2] };
}

/**
 * Read an Instagram unfurl. Two shapes are recognized, and nothing else:
 *   - Microlink: description `<likes> likes, <comments> comments - <handle> on
 *     <Month D, YYYY>: <q><caption><q>.`, title `<name> (@handle) • Instagram ...`.
 *   - LinkPreview: description = the bare caption, title `A post shared by <name>
 *     (@handle)`. The title shape is what vouches for the bare description here,
 *     since a bare string on its own could be anything (including a placeholder).
 *
 * og:title is only ever a handle/display-name source. Returns null (not parsed) for
 * any other shape, and for an empty caption, so the caller keeps today's behavior.
 */
export function parseInstagramMeta(meta: {
  title?: string | null;
  description?: string | null;
}): InstagramPost | null {
  const description = meta.description ?? "";
  const account = parseAccountTitle(meta.title);

  const m = MICROLINK_PREFIX.exec(description);
  if (m) {
    const caption = unquote(m[7]);
    if (!caption) return null;
    return {
      handle: m[3],
      displayName: account?.handle === m[3] ? account.displayName : null,
      date: isoDate(m[4], m[5], m[6]),
      likes: parseCount(m[1]),
      comments: parseCount(m[2]),
      caption,
    };
  }

  if (account && meta.title && SHARED_BY.test(meta.title)) {
    const caption = description.trim();
    if (!caption) return null;
    return {
      handle: account.handle,
      displayName: account.displayName,
      date: null,
      likes: null,
      comments: null,
      caption,
    };
  }

  return null;
}

/**
 * Drop `#`-prefixed tokens only. A trailing hashtag run can lose its `#` partway
 * through (`#Anime #Otaku AnimeCommunity Manga`), and those bare words stay: from the
 * text alone they're indistinguishable from real caption words, so they're left for
 * the model. A `#` glued to a preceding character (`C#`) isn't a hashtag either.
 */
export function stripHashtags(text: string): string {
  return text
    .replace(/(^|\s)#[\p{L}\p{N}_]+/gu, "$1")
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Abbreviations whose trailing `.` doesn't end a sentence. */
const ABBREVIATIONS = new Set([
  "dr", "mr", "mrs", "ms", "st", "no", "vs", "jr", "sr", "mt", "ft", "ph", "inc", "co",
]);

/** A sensible default Name length; longer first sentences end at a word boundary. */
export const FIRST_SENTENCE_MAX = 80;

/**
 * The caption's first sentence (or first line), as a deterministic stand-in Name until
 * comprehension produces a better one. A `.` ends the sentence only when the word
 * before it isn't a short abbreviation (`NO. 1`, `Dr. Smith`) and the next character
 * doesn't continue it (a digit or a lowercase letter). Over `max`, cut at the last
 * word boundary and mark it with `…`.
 */
export function firstSentence(text: string, max = FIRST_SENTENCE_MAX): string {
  const line = text.trim().split("\n")[0].trim();
  let end = line.length;
  const boundary = /([.!?…]+)(\s+|$)/g;
  let m: RegExpExecArray | null;
  while ((m = boundary.exec(line))) {
    const before = line.slice(0, m.index);
    const word = /([\p{L}\p{N}]+)$/u.exec(before)?.[1] ?? "";
    const next = line[m.index + m[0].length] ?? "";
    const isPeriodOnly = m[1] === ".";
    if (isPeriodOnly && (ABBREVIATIONS.has(word.toLowerCase()) || word.length === 1)) continue;
    if (/[\p{Ll}\p{N}]/u.test(next)) continue;
    end = m.index + m[1].length;
    break;
  }

  const sentence = line.slice(0, end).trim();
  if (sentence.length <= max) return sentence;
  const cut = sentence.slice(0, max);
  const space = cut.lastIndexOf(" ");
  const head = (space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:\u2013\u2014-]+$/, "");
  return `${head}…`;
}
