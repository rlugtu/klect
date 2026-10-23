/**
 * Conservative cleanup of SEO-suffixed page titles: "Recipe Name | Site Name" →
 * "Recipe Name".
 *
 * Kept free of Prisma and `server-only` on purpose, like move-plan.ts: it is pure
 * string in, string out, so the unfurl pipeline (core/metadata.ts), the JSON-LD mapper
 * (core/structured-data.ts), and a plain `tsx` script can all import the one
 * implementation (see `scripts/verify-title-clean.ts`).
 *
 * The bias is hard toward leaving a title alone. A wrongly-stripped title destroys
 * meaning the user then has to retype; a missed suffix is only cosmetic. So every
 * guard below votes "don't touch it", the unspaced `-` and `:` are never treated as
 * separators (that is what protects "Tokyo-Drift" and "9:16 Aspect Ratio"), and at
 * most ONE tail is ever removed — no loop, no recursion on the result.
 *
 * Two guards can be overridden, by the two non-length signals below (the platform
 * allowlist and the organization-name shape) and by nothing else.
 */

/**
 * Tails that are a site's own nav label rather than any part of the page's title, so
 * they are stripped without weighing the shape guards below.
 */
const BOILERPLATE_TAIL =
  /\s*(?:[|–—·•»]|\s[-:])\s*(?:home\s+page|homepage|home|official\s+(?:web)?site)\s*$/i;

/** Separator debris left at the end of the head once a tail is removed. */
const TRAILING_SEPARATORS = /[\s|–—·•»:-]+$/;

/**
 * Two separator classes. The first may be unspaced, because no real title uses these
 * characters mid-word. ` - ` and ` : ` MUST be spaced on both sides: a bare `-` or `:`
 * is ordinary punctuation ("Tokyo-Drift", "9:16 Aspect Ratio").
 *
 * Built fresh per call — a module-level `/g` regex carries `lastIndex` between calls.
 */
function separatorPattern(): RegExp {
  return /[|–—·•»]|\s-\s|\s:\s/g;
}

/** A head this short means the tail probably carried the real meaning. */
const MIN_HEAD_LENGTH = 15;
/** Past this, the tail is content, not a brand. */
const MAX_TAIL_LENGTH = 35;
const MAX_TAIL_WORDS = 5;
/** Sentence punctuation marks the tail as prose rather than a site name. */
const SENTENCE_PUNCTUATION = /[.!?,;]/;
/** ...except a bare domain, where the dots are the brand ("nytimes.com"). */
const BARE_DOMAIN = /^[a-z0-9-]+(\.[a-z]{2,})+$/i;

/**
 * The first non-length signal, for the short-head guard. A head under MIN_HEAD_LENGTH
 * normally means the tail carried the real meaning ("Allrecipes | Best Chocolate Chip
 * Cookies", head 10), so that guard returns early without even reading the tail. That is
 * wrong for one narrow case: a tail that IS, exactly, the name of a platform no page ever
 * has as its content ("Ramen - Wikipedia", head 5). No length measure separates those
 * two titles; a closed list of names does.
 *
 * Matched lowercased against the WHOLE tail, never as a substring. "Cats | Wikipedia
 * Article Review Guidelines" is a real title ABOUT Wikipedia and has to survive. Whole-
 * tail equality is also what keeps the remaining guards meaningful rather than something
 * this list quietly erodes: a matching tail is one short unpunctuated word by
 * construction, so it clears MAX_TAIL_LENGTH, MAX_TAIL_WORDS and SENTENCE_PUNCTUATION on
 * its own merits instead of being waved past them.
 *
 * Every entry is a coined trademark with no ordinary English sense, so a tail consisting
 * of it alone cannot be content. Candidates that failed that bar are NOT here and must
 * not be added, because each one has a plausible real-content tail. They are listed in
 * scripts/verify-title-clean.ts: Medium ("T-Shirt | Medium"), Amazon ("Macaws - Amazon"),
 * Twitter, X, Apple, Discord, Target, Yelp, Steam, Slack, Meta.
 *
 * Amazon is rejected as a bare NAME only. Its full domain string is unambiguous and is
 * admitted separately, by EXACT_DOMAIN_TAILS below, which exists because this set cannot
 * express that distinction.
 */
const PLATFORM_TAILS = new Set([
  "wikipedia",
  "youtube",
  "reddit",
  "facebook",
  "instagram",
  "pinterest",
  "linkedin",
  "tiktok",
  "imdb",
  "spotify",
  "github",
  "etsy",
]);
/** "| Pinterest.com" makes the same claim as "| Pinterest". One optional TLD, no more. */
const PLATFORM_DOMAIN_SUFFIX = /\.(?:com|org|net|tv)$/;

/**
 * The same signal, for the one platform whose full domain is admissible while its bare
 * name is not. It needs its own set because PLATFORM_TAILS above cannot express that: that
 * set is consulted AFTER PLATFORM_DOMAIN_SUFFIX has normalized a TLD away, so an
 * "amazon.com" entry there would be looked up as "amazon" and could only ever fire if the
 * bare word were on the list too.
 *
 * And the bare word must not be. "Amazon" is a river, a rainforest and a parrot genus, so
 * a tail of it alone can be real content ("Macaws - Amazon"). The full "Amazon.com" string
 * carries none of that ambiguity: no page's own title ends in exactly a dotted domain
 * unless the domain is the site's name.
 *
 * So entries here are matched against the lowercased tail with NO suffix stripping at all —
 * whole-string equality, TLD included. That is also why this is not generalized across
 * PLATFORM_DOMAIN_SUFFIX's four TLDs: "Amazon.org" and "Amazon.net" are not Amazon's
 * domain, so they stay on the ambiguous side of the line and are left alone. Letting the
 * general stripping logic reach this set would collapse it back into the bare-word case
 * this set exists to avoid.
 *
 * Everything else matches PLATFORM_TAILS: whole-tail equality (never a substring, so
 * "Deals | Amazon.com Prime Day Guide" survives), case-insensitive, and the three
 * non-overridable guards still apply — the `.` would trip SENTENCE_PUNCTUATION were
 * BARE_DOMAIN not already excusing a bare domain tail.
 */
const EXACT_DOMAIN_TAILS = new Set(["amazon.com"]);

/** Is the tail, by itself, a platform name that no page can have as its content? */
function isPlatformTail(tail: string): boolean {
  const lower = tail.toLowerCase();
  // Checked first, and on the un-stripped string, so PLATFORM_DOMAIN_SUFFIX never touches
  // these entries. The two lookups are independent: neither set can match via the other.
  if (EXACT_DOMAIN_TAILS.has(lower)) return true;
  return PLATFORM_TAILS.has(lower.replace(PLATFORM_DOMAIN_SUFFIX, ""));
}

/**
 * The second non-length signal, for the one case length cannot judge. A tail LONGER than
 * the head is normally the real content ("Serious Eats Recipes | Best Chocolate Chip Cookies",
 * head 20 / tail 27), but a formal organization name is still a brand suffix however
 * long it runs ("Best Hikes Near Seattle - Washington Trails Association", head 23 /
 * tail 29). Those two sit within a few characters of each other on every length measure,
 * so telling them apart needs a signal that is not about length at all.
 *
 * It takes BOTH halves below. The entity noun on its own also strips real content
 * ("Our Old Buildings - Cracks in the Foundation", "Who Pays for Art | Our Cultural
 * Institutions"); the pair strips neither. See scripts/verify-title-clean.ts.
 */

/**
 * Formal entity nouns, matched as the tail's LAST word. This is only the detector — the
 * whole tail is what gets removed, so "Mountain Trail Preservation Society" goes entirely.
 *
 * The media-generic words (News, Times, Post, Press, Media, Blog, Magazine, Journal,
 * Group, Network, Trust) are left out on purpose: those brands are short, so the length
 * guards already strip them, while as tails they are ordinary content ("How Rumors
 * Spread | The Whisper Network"). Singular only, for the same reason — a plural entity
 * noun reads as prose ("Our Broken Institutions"), not as anyone's name.
 */
const ENTITY_NOUN =
  /\b(?:association|foundation|institute|institution|society|university|museum|council|alliance|coalition|federation|conservancy)$/i;

/** An organization's name is a short proper-noun phrase, not a sentence fragment. */
const MAX_NAME_WORDS = 4;
/** A proper noun starts with a capital in any script, or with a digit ("3M Foundation"). */
const PROPER_NOUN_START = /^[\p{Lu}\p{N}]/u;
/** Lowercase words a proper name may still contain ("Victoria and Albert Museum"). */
const NAME_CONNECTORS = new Set(["of", "for", "and", "the", "&", "de", "la", "du", "van", "von"]);
/**
 * ...and a name never OPENS with an article, determiner, or question word. "The" is
 * absent from this list on purpose: "The Nature Conservancy" is a name, where "A Truly
 * Just Society" and "Our Cultural Institutions" are claims about one.
 */
const NOT_A_NAME_OPENER =
  /^(?:a|an|our|your|my|their|his|her|its|this|that|these|those|some|many|all|every|each|no|not|what|why|how|when|where|who|which|and|but|or|if|to|in|on|at|for|of|from|with)$/i;

/** Does the tail read as a proper organization NAME rather than a phrase about one? */
function looksLikeOrganizationName(tail: string): boolean {
  const words = tail.split(" ");
  if (words.length > MAX_NAME_WORDS) return false;
  if (NOT_A_NAME_OPENER.test(words[0])) return false;
  // Every word is either a capitalized proper noun or one of the connectors above. An
  // all-lowercase tail carries no proper-noun signal, so it keeps the length guard.
  return words.every((w) => PROPER_NOUN_START.test(w) || NAME_CONNECTORS.has(w.toLowerCase()));
}

/**
 * Strip at most one trailing site/brand suffix from a page title.
 *
 * Never returns a string longer than the one it was given. Returns `null` only for
 * null/undefined/empty/whitespace-only input — when a guard trips, it returns the input
 * trimmed and whitespace-collapsed, unchanged, rather than `null`.
 */
export function cleanTitle(raw: string | null | undefined): string | null {
  const s = raw?.trim().replace(/\s+/g, " ") ?? "";
  if (!s) return null;

  // Site boilerplate is never part of the title, so it skips the shape guards.
  const boilerplate = BOILERPLATE_TAIL.exec(s);
  if (boilerplate) {
    const head = s.slice(0, boilerplate.index).replace(TRAILING_SEPARATORS, "");
    return head || s; // nothing but boilerplate ("| Home") → leave it alone
  }

  // Only the LAST separator is considered: a brand suffix is always the final segment.
  const separator = separatorPattern();
  let last: RegExpExecArray | null = null;
  for (let m = separator.exec(s); m; m = separator.exec(s)) last = m;
  if (!last) return s;

  const head = s.slice(0, last.index).trim();
  const tail = s.slice(last.index + last[0].length).trim();
  if (!tail) return head || s;

  // First overridable guard: a short head means the tail probably carried the meaning,
  // unless the tail is exactly a platform name ("Ramen - Wikipedia").
  const platformTail = isPlatformTail(tail);
  if (head.length < MIN_HEAD_LENGTH && !platformTail) return s;

  // Second overridable guard: a tail longer than the head is content, unless it is a
  // formal organization name or that same platform name. The platform signal has to waive
  // this one as well, not just the guard above: a short head with a platform tail usually
  // IS shorter than the tail (every head under 9 chars is, for "Wikipedia"), so waiving
  // only the short-head guard would leave the allowlist unable to fire on 42% of the
  // titles it exists for, the required "Ramen - Wikipedia" among them.
  //
  // The two signals are otherwise independent, each scoped to the guard it can judge, and
  // the scoping is asymmetric on purpose: the organization-name shape does NOT reach back
  // to the guard above, so "Our Mission | Washington Trails Association" (head 11) stays
  // untouched. A shape heuristic is weaker evidence than a closed-set name match, and the
  // short-head guard is the one protecting titles whose tail is the real content.
  //
  // Every guard AFTER this one still applies to both signals, so an over-long
  // organization name ("Woods Hole Oceanographic Institution", 36 chars) is still left
  // alone — the length cap stays the backstop against a long tail that merely ends in an
  // entity noun.
  const organizationTail = ENTITY_NOUN.test(tail) && looksLikeOrganizationName(tail);
  if (tail.length > head.length && !organizationTail && !platformTail) return s;

  if (tail.length > MAX_TAIL_LENGTH) return s;
  if (tail.split(" ").length > MAX_TAIL_WORDS) return s;
  if (SENTENCE_PUNCTUATION.test(tail) && !BARE_DOMAIN.test(tail)) return s;

  return head;
}
