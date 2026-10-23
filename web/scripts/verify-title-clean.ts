/**
 * Network-free check of the title cleaner in src/lib/title-clean.ts (the suffix-
 * stripping applied to JSON-LD names and to every unfurl fallback's og:title).
 * No database, no network: fixtures in, assertions out.
 *
 *   npx tsx scripts/verify-title-clean.ts
 *
 * Exits non-zero on the first failed expectation. The regression set (titles that must
 * come back untouched) matters more than the positives: a wrongly-stripped title loses
 * meaning the user has to retype, a missed suffix is only cosmetic.
 */
import assert from "node:assert/strict";
import { cleanTitle } from "../src/lib/title-clean";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok  ${name}`);
}

/** Every input the invariants below sweep, strip-correctly and leave-alone alike. */
const ALL_INPUTS: (string | null | undefined)[] = [];

function strips(input: string, expected: string) {
  ALL_INPUTS.push(input);
  check(`strips: ${input}`, () => assert.equal(cleanTitle(input), expected));
}

function leaves(input: string) {
  ALL_INPUTS.push(input);
  check(`leaves: ${input}`, () => assert.equal(cleanTitle(input), input));
}

// ---------------------------------------------------------------- strips correctly

strips(
  "How to Make Sourdough Bread at Home | King Arthur Baking",
  "How to Make Sourdough Bread at Home",
);
strips("Chocolate Chip Cookies · Smitten Kitchen", "Chocolate Chip Cookies");
strips("Our Story - Home", "Our Story");
strips("The Best Noodles in Taipei — nytimes.com", "The Best Noodles in Taipei");
strips("Roasted Carrots With Dukkah » Bon Appétit", "Roasted Carrots With Dukkah");
strips("The Complete Guide to Cast Iron | Serious Eats", "The Complete Guide to Cast Iron");
strips("Sunrise Hike at Rattlesnake Ledge : WTA", "Sunrise Hike at Rattlesnake Ledge");
strips("Neighborhood Coffee Roasters | Official Website", "Neighborhood Coffee Roasters");
strips("Lagoon Bakehouse • Homepage", "Lagoon Bakehouse");

// A bare domain tail is stripped even though it contains a `.` — the dots are the brand.
strips("Twelve Great Weekend Day Trips | theguardian.com", "Twelve Great Weekend Day Trips");

// ---------------------------------------------------------------- leaves alone

// Unspaced `-` and `:` are ordinary punctuation, never separators.
leaves("Tokyo-Drift");
leaves("9:16 Aspect Ratio Explained");
leaves("Mission-Style Burritos, Ranked");

// Short head: the tail probably carried the real meaning.
leaves("Allrecipes | Best Chocolate Chip Cookies");
leaves("WTA - Sunrise Hike at Rattlesnake Ledge");

// Tail longer than the head: that is content, not a brand.
leaves("Serious Eats Recipes | Best Chocolate Chip Cookies");

// A tail with sentence punctuation (and not a bare domain) is prose, not a site name.
leaves("Everything About Sourdough | Hot, Fresh");
leaves("The Longest Day of the Year — Yes, really");

// Tail too long / too many words to be a brand.
leaves("A Perfectly Reasonable Title | An Unreasonably Long Trailing Clause Here");
leaves("Twelve Hikes Near Seattle | five six seven eight nine ten");

// No separator at all.
leaves("Chocolate Chip Cookies");
leaves("Best Hikes Near Seattle");

// Nothing but boilerplate: there is no head to keep.
leaves("| Home");

// ("Best Hikes Near Seattle - Washington Trails Association" used to be left alone
// here. It now strips — see the organization-name section below for why.)

// -------------------------------------------- organization-name tails (second signal)
//
// RESOLVED (was a SPEC CONFLICT in the prior pass). "Best Hikes Near Seattle -
// Washington Trails Association" has a tail (29 chars) LONGER than its head (23), the
// one guard that also protects "Serious Eats Recipes | Best Chocolate Chip Cookies"
// (head 20 / tail 27) just above. No length heuristic separates those two, so
// title-clean.ts added a non-length signal: the tail's last word is a formal entity
// noun AND the tail reads as a proper NAME (<= 4 words, no article/determiner opener,
// every word capitalized or a connector). Both halves are required — measured over a
// 58-title corpus (29 titles whose tail really is a brand, 29 whose tail is content),
// the entity noun ALONE took strip accuracy from 7/29 to 24/29 but
// newly destroyed 13 content titles; the pair reaches the same 24/29 and newly destroys
// one, an instance of the brand-in-the-head class documented at the bottom of this file
// that already misfires without the signal.

strips(
  "Best Hikes Near Seattle - Washington Trails Association",
  "Best Hikes Near Seattle",
);
strips("Birding for Beginners | National Audubon Society", "Birding for Beginners");
strips("Your Rights Online — Electronic Frontier Foundation", "Your Rights Online");
// A leading "The" is a name, so it is NOT in the blocked-opener list.
strips("Saving Coral Reefs | The Nature Conservancy", "Saving Coral Reefs");
// A lowercase connector mid-name is still a name ("and").
strips("Visit the Exhibit | Victoria and Albert Museum", "Visit the Exhibit");
// Four words is the cap, not a word under it.
strips("Teach Kids Chess | United States Chess Federation", "Teach Kids Chess");
strips("Where Money Goes | The Brookings Institution", "Where Money Goes");

// ---- and the regressions that are the whole reason the signal is a PAIR of checks ----
//
// Every title below ends in an entity noun and would be WRONGLY stripped by the word
// list on its own. If anyone ever loosens looksLikeOrganizationName(), these fail first.

// Lowercase "in"/"the" mid-tail: prose, not a proper name. The single most important
// case here — it is the one a bare word list gets wrong most convincingly.
leaves("Our Old Buildings - Cracks in the Foundation");
// A determiner opener ("Our") plus a plural entity noun: a claim about organizations,
// not the name of one. Plurals are off the word list for exactly this reason.
leaves("Who Pays for Art | Our Cultural Institutions");
leaves("Ten Years of Protest | These Fragile Alliances");
// Indefinite article opener: organizations are never "A Something".
leaves("Rawls Explained | A Truly Just Society");
// Possessive opener plus a lowercase "at".
leaves("Lessons From Dad - My First Year at University");
// Quantifier opener.
leaves("The Tuition Problem | Every Private University");
// Question-word opener.
leaves("Civics Class Notes | What Makes a Society");
// Case matters: an all-lowercase tail carries no proper-noun signal at all, so it keeps
// the length guard even though it IS the organization from the first fixture above.
leaves("best hikes near seattle - washington trails association");

// ---- words deliberately kept OFF the entity-noun list ----
//
// The brief floated Network, Trust, Group, Press, Media, Magazine, Blog, News, Times,
// Post, Journal, Inc, LLC, Co. They were tested and rejected: those brands are short
// enough that the length guards already strip them, so adding them bought almost no new
// hits while costing real content. On that same corpus the broad list scored 13/29 hits
// and newly destroyed 8 titles; the narrow list scored 24/29. Do not re-add them.
leaves("How Rumors Spread | The Whisper Network");
leaves("The Honor System - A Matter of Trust");

// ---- accepted misses: the guards the signal does NOT override ----
//
// The signal waives ONLY `tail.length > head.length`. Everything else still applies,
// which is what keeps a long prose tail that merely ends in an entity noun safe — at the
// cost of these genuine organization names. That trade is deliberate: a missed suffix is
// cosmetic, a wrongly-stripped title is retyping.

// Tail is 36 chars, over MAX_TAIL_LENGTH.
leaves("Mapping the Ocean · Woods Hole Oceanographic Institution");
// Tail is 5 words, over MAX_NAME_WORDS. A real org name, and still not worth it: 5 words
// is where prose tails live.
leaves("Where We Work Now | Big Sky Land Trust Council");
// Head is 14 chars, under MIN_HEAD_LENGTH.
leaves("Grants We Fund | The Pew Charitable Trusts");
// Six-word tail, over MAX_TAIL_WORDS.
leaves("Why I Left Big Law - To Start a Food Bank Foundation");

// ------------------------------------------- platform-name tails (third signal)
//
// RESOLVED SPEC CONFLICT. The brief scoped this signal to override the short-head guard
// ONLY, while also requiring "Ramen - Wikipedia" to strip. Those cannot both hold: that
// title's tail (9) is LONGER than its head (5), so it trips the tail-longer-than-head
// guard immediately after. Measured over the allowlist, a platform tail outruns every
// head shorter than 4-9 chars depending on the name, which is 42% of the short-head range
// the signal exists for. Waiving only the short-head guard would therefore have shipped a
// list that cannot fire on the one fixture the brief required. So the platform signal
// waives BOTH guards, and the other three (max tail length, max tail words, sentence
// punctuation) still apply as the brief specified.
//
// It is scoped tighter than the organization-name signal in every other way, because it is
// stronger evidence: a closed set of coined trademarks matched against the WHOLE tail, not
// a shape heuristic. Measured over a labeled 40-title short-head corpus (20 whose tail is
// really a site suffix, 20 whose tail is the real content), it took strip accuracy from
// 0/20 to 13/20 and destroyed 0 content titles.

strips("Ramen - Wikipedia", "Ramen");
strips("Cats | Reddit", "Cats");
strips("Reels | Instagram", "Reels");
strips("Lo-fi Beats - YouTube", "Lo-fi Beats");
strips("Mini Tote Bag - Etsy", "Mini Tote Bag");
strips("Dune (2021) — IMDb", "Dune (2021)");
strips("Mom's Pho · Facebook", "Mom's Pho");
strips("Jazz Mix | Spotify", "Jazz Mix");
strips("Ryan Lugtu | LinkedIn", "Ryan Lugtu");
strips("Sunset Reel | TikTok", "Sunset Reel");
strips("klect/web | GitHub", "klect/web");
// Case-insensitive: the allowlist is matched against a lowercased tail.
strips("Pho | wikipedia", "Pho");
// The one normalization: an optional trailing TLD. The `.` would trip the punctuation
// guard, except BARE_DOMAIN already excuses a bare domain tail.
strips("Clip Art | Pinterest.com", "Clip Art");
// The head being a platform name does not matter; only the tail is consulted. This is the
// Wikipedia article ABOUT YouTube, and stripping the suffix is the right answer.
strips("YouTube - Wikipedia", "YouTube");

// ---- short heads that must still be left alone, which is what keeps the list tight ----

// The whole point of whole-tail equality: a tail that merely CONTAINS a platform name is
// a title about the platform, not a title from it. These are the cases a substring match
// would destroy, and they are why the check is an equality.
leaves("Cats | Wikipedia Article Review Guidelines");
leaves("Recipes | Reddit Recipes Megathread");
leaves("Beats - YouTube Music Family Plan");
// Wikipedia's own older title format. The tail is not equal to the allowlist entry, and
// its comma trips the punctuation guard too. An accepted miss, not a bug.
leaves("Ramen - Wikipedia, the free encyclopedia");
// A genuinely ambiguous short tail, on no list at all: the default protection holds.
leaves("Pho | Hanoi Eats");
// The separator rules still govern everything. An unspaced hyphen is not a separator, so
// there is no tail here for the allowlist to ever see.
leaves("Ramen-Wikipedia");
// A platform name in the HEAD is not a licence to strip the tail.
leaves("Wikipedia | Ramen");

// ---- names deliberately kept OFF the allowlist ----
//
// Each one is an ordinary English word, a size, or a place before it is a website, so a
// tail consisting of it alone can be real content. Every title below would be destroyed by
// adding its name, and that cost buys a suffix the length guards already strip whenever
// the head is long enough to be trusted. Do not add them.

// "Medium" is a size. This is the single most convincing case against a broad list.
leaves("T-Shirt | Medium");
// "Amazon" is a river and a rainforest. THE regression for the exact-domain set added
// below: the bare word must never match, only the full "Amazon.com" string does. If anyone
// ever moves "amazon" into PLATFORM_TAILS, or lets PLATFORM_DOMAIN_SUFFIX normalize
// EXACT_DOMAIN_TAILS, this line fails first.
leaves("Macaws - Amazon");
// "Apple" is a fruit.
leaves("Pie - Apple");
// "Twitter" is a sound birds make. Also rejected because X/Twitter titles use an unspaced
// separator, so the entry would have bought almost nothing even at zero risk.
leaves("Birdsong | Twitter");
// Rejected for the same reason, untested here only to keep the list short: X, Discord,
// Target, Yelp, Steam, Slack, Meta.

// ---- the one exact-domain entry (EXACT_DOMAIN_TAILS) ----
//
// "Amazon" the bare word is ambiguous and stays rejected above; "Amazon.com" the full
// domain string is not, because no page's own title ends in exactly a dotted domain unless
// the domain is the site's name. PLATFORM_TAILS cannot hold it: that set is consulted after
// PLATFORM_DOMAIN_SUFFIX has already normalized the TLD away, so an entry there would be
// looked up as "amazon" and would re-admit the river and the rainforest. So it lives in a
// second set matched on the un-stripped lowercased tail, exact equality, TLD included.
//
// Every fixture below deliberately has a SHORT head, because that is the only place the
// allowlist is load-bearing: with a head of 15+ chars, BARE_DOMAIN already excuses any
// dotted tail and the strip happens without any allowlist at all (see the "theguardian.com"
// fixture at the top of this file). A short head is where the signal has to do the work.

// Head is 14 chars, one under MIN_HEAD_LENGTH, so only the allowlist can strip this.
strips("Wireless Mouse - Amazon.com", "Wireless Mouse");
// Head 9 / tail 10: the tail is also LONGER than the head, so this needs the signal to
// waive both overridable guards, same as "Ramen - Wikipedia" above.
// Case-insensitive, matching the convention everywhere else in this module.
strips("Mouse Pad | amazon.com", "Mouse Pad");

// ---- and the adversarial cases that prove the entry did not generalize ----

// Not Amazon's domain. PLATFORM_DOMAIN_SUFFIX would strip these TLDs to "amazon" if it were
// ever applied to EXACT_DOMAIN_TAILS; it is not, so there is no match and the short-head
// guard holds. These are the fixtures that fail if the new set is folded into the old one.
leaves("Macaws - Amazon.org");
leaves("Macaws - Amazon.net");
// Whole-tail equality, not a substring: a tail that merely CONTAINS the domain is a title
// about the store, not a title from it.
leaves("Deals | Amazon.com Prime Day Guide");

// ---- how the two non-length signals compose ----
//
// They are independent, each scoped to one guard, and NOT symmetric. The organization-name
// shape waives the tail-longer-than-head guard only, so it never reaches the short-head
// guard: the tail below is a real organization name (entity noun, 3 words, proper-noun
// opener) and still does not strip, because the head is 11 chars. If anyone ever lets
// organizationTail override MIN_HEAD_LENGTH, this fails first. The asymmetry is the point:
// a closed-set name match is stronger evidence than a shape heuristic, so only the former
// is trusted against a short head.
leaves("Our Mission | Washington Trails Association");
// And the reverse: a platform tail does NOT acquire the organization signal's reach into
// anything else. All three remaining guards still apply to it unchanged.

// ---------------------------------------------------------------- empty-ish input

check("null and empty inputs return null", () => {
  assert.equal(cleanTitle(null), null);
  assert.equal(cleanTitle(undefined), null);
  assert.equal(cleanTitle(""), null);
  assert.equal(cleanTitle("   "), null);
});

check("whitespace is trimmed and collapsed, not treated as a change", () => {
  assert.equal(cleanTitle("  Chocolate   Chip  Cookies  "), "Chocolate Chip Cookies");
});

// SPEC CONFLICT (reported): the brief listed this under "leaves alone", but its guard
// is scoped to the TAIL (`/[.!?,;]/.test(tail)`) and the punctuation here is in the
// head. Widening the guard to the whole string would stop stripping any title with a
// comma or an abbreviation in it ("Dr. Smith's Guide to X | WebMD"), so the tail-scoped
// guard stays and this strips — which is the desirable result anyway.
check('sentence punctuation in the HEAD does not block a strip', () => {
  assert.equal(
    cleanTitle("I went to Rome. It was great | Blog"),
    "I went to Rome. It was great",
  );
});

// Known corner, deliberately accepted: "strip at most once" means a title carrying BOTH
// a brand tail and a boilerplate tail only loses the boilerplate on the first pass, so
// it is not idempotent. Strip-once is the stronger safety guarantee, so it wins.
check("chained tails only lose one segment per call", () => {
  assert.equal(cleanTitle("Best Pasta Recipes | Serious Eats | Home"), "Best Pasta Recipes | Serious Eats");
});

// KNOWN LIMITATION, pre-existing and not introduced by the organization-name signal:
// when the HEAD is the brand and the TAIL is the real content, nothing in this module can
// tell which side is which, so the head wins. The control below proves the class predates
// the new signal — it already behaved this way, because its tail is shorter than its head
// and so never reached the new code at all. Accepted rather than fixed: the only cure is
// knowing the site's brand, which a pure string function does not.
check("brand-in-the-head titles lose the content half (both before and after)", () => {
  // Reaches the new signal (tail 28 > head 23) and strips.
  assert.equal(
    cleanTitle("Encyclopedia Britannica | American Medical Association"),
    "Encyclopedia Britannica",
  );
  // Never reaches it (tail and head are both 23 chars, so the length guard never trips)
  // and strips anyway, which is what makes this class pre-existing.
  assert.equal(
    cleanTitle("Encyclopedia Britannica | Atlantic Ocean Currents"),
    "Encyclopedia Britannica",
  );
  // The platform allowlist adds one instance of the same class rather than a new one: when
  // BOTH halves are platform names, the tail is stripped because only the tail is ever
  // consulted. Genuinely ambiguous (a video titled "Wikipedia"? an article about YouTube?)
  // and accepted on the same grounds: a pure string function cannot know the site.
  assert.equal(cleanTitle("Wikipedia | YouTube"), "Wikipedia");
});
// Swept by the invariants below even though the expectations above are not equalities.
ALL_INPUTS.push(
  "Encyclopedia Britannica | American Medical Association",
  "Encyclopedia Britannica | Atlantic Ocean Currents",
  "Wikipedia | YouTube",
);

// ---------------------------------------------------------------- invariants

check(`never returns a longer string (${ALL_INPUTS.length} inputs)`, () => {
  for (const input of ALL_INPUTS) {
    const out = cleanTitle(input);
    if (out === null) continue;
    assert.ok(
      out.length <= (input ?? "").length,
      `cleanTitle grew the title: ${JSON.stringify(input)} → ${JSON.stringify(out)}`,
    );
  }
});

check(`idempotent (${ALL_INPUTS.length} inputs)`, () => {
  for (const input of ALL_INPUTS) {
    const once = cleanTitle(input);
    assert.equal(
      cleanTitle(once),
      once,
      `cleanTitle is not idempotent for ${JSON.stringify(input)}`,
    );
  }
});

check("null only ever comes from empty input", () => {
  for (const input of ALL_INPUTS) {
    assert.notEqual(
      cleanTitle(input),
      null,
      `cleanTitle returned null for non-empty ${JSON.stringify(input)}`,
    );
  }
});

console.log(`\n${passed} checks passed (${ALL_INPUTS.length} title fixtures)`);
