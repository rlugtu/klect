/**
 * Network-free check of the Instagram unfurl reader in src/lib/instagram.ts (the
 * caption/handle/date parsing behind Instagram autofill). No database, no network:
 * fixtures in, assertions out. The carousel and photo strings are the real Microlink /
 * LinkPreview responses captured for posts DeIDWwiAQC1 and Dex748mljEc; the reel is
 * built from the captured reel shapes (title format, mixed `52K` / `7,410` counts,
 * embedded newlines) with a stand-in handle.
 *
 *   npx tsx scripts/verify-instagram.ts
 *
 * Exits non-zero on the first failed expectation. The null set matters as much as the
 * positives: an unrecognized shape must come back "not parsed" so the caller keeps
 * today's behavior, never a half-parse that puts garbage in the Name.
 */
import assert from "node:assert/strict";
import {
  isInstagramUrl,
  parseInstagramMeta,
  parseAccountTitle,
  parseCount,
  stripHashtags,
  firstSentence,
  FIRST_SENTENCE_MAX,
} from "../src/lib/instagram";
import { cleanTitle } from "../src/lib/title-clean";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok  ${name}`);
}

const LDQ = "“"; // “
const RDQ = "”"; // ”

// ---------------------------------------------------------------- real samples

const CAROUSEL_CAPTION =
  "ANIME THAT WENT WAY TOO FAR… \u{1F480} Some anime started with a simple story before " +
  "taking things into a much darker and more unexpected direction. From shocking twists to " +
  "disturbing themes and moments that completely changed the tone, these series definitely " +
  "know how to push boundaries. Which anime do you think went way too far? \u{1F440} #Anime " +
  "#DarkAnime #AnimeRecommendations #AnimeFans #Otaku AnimeCommunity Manga AnimeMoments Weeb " +
  "drkamui drkamuifr";

const CAROUSEL_MICROLINK = {
  title: "Dr.kamui | Djivenson Beauplan (@dr.kamui) • Instagram photos and videos",
  description: `4,462 likes, 127 comments - dr.kamui on October 5, 2026: ${LDQ}${CAROUSEL_CAPTION}${RDQ}.`,
};

const CAROUSEL_LINKPREVIEW = {
  title: "A post shared by Dr.kamui | Djivenson Beauplan (@dr.kamui)",
  description: CAROUSEL_CAPTION,
};

const PHOTO_CAPTION =
  "\u{1F6A8} NEWS: Former junior WORLD NO. 1 and Roland Garros boys’ champion Gabriel " +
  "Debru is leaving Texas to turn PRO just months after joining the Longhorns Debru, who " +
  "reached a career-high ATP No. 233, arrived in Austin this August after an All-American " +
  `season at Illinois. ${LDQ}Although my time in Texas was short,${RDQ} Debru wrote, thanking ` +
  "his coaches and teammates before announcing plans to compete on the circuit in the " +
  "coming weeks.";

// The photo's OPENING quote is U+201D, not U+201C (finding 8).
const PHOTO_MICROLINK = {
  title: "College Tennis Nation (@ctennisnation) • Instagram photos and videos",
  description: `1,549 likes, 18 comments - ctennisnation on October 21, 2026: ${RDQ}${PHOTO_CAPTION}${RDQ}.`,
};

const REEL_CAPTION =
  "3 mistakes killing your squat gains\n\n1. Knees caving in\n2. Rushing the descent\n" +
  "3. Skipping the warm-up\n\nSave this for leg day #fitness #squats #legday";

const REEL_MICROLINK = {
  title: "Joseph Munoz Ph.D. | Fitness Coach and Educator (@coach.jmunoz) • Instagram reel",
  description: `52K likes, 7,410 comments - coach.jmunoz on March 3, 2026: ${LDQ}${REEL_CAPTION}${RDQ}.`,
};

// ---------------------------------------------------------------- isInstagramUrl

for (const url of [
  "https://www.instagram.com/p/DeIDWwiAQC1/",
  "https://instagram.com/reel/DeGC80pC82E",
  "https://m.instagram.com/p/Dex748mljEc/?igsh=abc",
  "https://instagr.am/p/DeIDWwiAQC1/",
]) {
  check(`instagram url: ${url}`, () => assert.equal(isInstagramUrl(url), true));
}
for (const url of [
  "https://www.tiktok.com/@x/video/1",
  "https://www.facebook.com/reel/1",
  "https://notinstagram.com/p/1",
  "https://instagram.com.evil.example/p/1",
  "not a url",
]) {
  check(`not instagram: ${url}`, () => assert.equal(isInstagramUrl(url), false));
}

// ---------------------------------------------------------------- counts

check("count: 52K", () => assert.equal(parseCount("52K"), 52_000));
check("count: 7,410", () => assert.equal(parseCount("7,410"), 7_410));
check("count: 1.2M", () => assert.equal(parseCount("1.2M"), 1_200_000));
check("count: 18", () => assert.equal(parseCount("18"), 18));
check("count: garbage", () => assert.equal(parseCount("lots"), null));

// ---------------------------------------------------------------- Microlink shape

check("carousel (microlink): every field", () => {
  assert.deepEqual(parseInstagramMeta(CAROUSEL_MICROLINK), {
    handle: "dr.kamui",
    displayName: "Dr.kamui | Djivenson Beauplan",
    date: "2026-10-05",
    likes: 4_462,
    comments: 127,
    caption: CAROUSEL_CAPTION,
  });
});

check("photo (microlink): U+201D opener, inner curly quotes kept", () => {
  const post = parseInstagramMeta(PHOTO_MICROLINK);
  assert.ok(post);
  assert.equal(post.handle, "ctennisnation");
  assert.equal(post.displayName, "College Tennis Nation");
  assert.equal(post.date, "2026-10-21");
  assert.equal(post.likes, 1_549);
  assert.equal(post.comments, 18);
  // Only the OUTER pair is stripped: the caption's own quotes and final `.` survive.
  assert.equal(post.caption, PHOTO_CAPTION);
  assert.ok(post.caption.includes(`${LDQ}Although my time in Texas was short,${RDQ}`));
  assert.ok(post.caption.endsWith("coming weeks."));
});

check("reel (microlink): abbreviated + grouped counts, embedded newlines", () => {
  const post = parseInstagramMeta(REEL_MICROLINK);
  assert.ok(post);
  assert.equal(post.handle, "coach.jmunoz");
  // A `|` inside the display name is part of the name, never a separator.
  assert.equal(post.displayName, "Joseph Munoz Ph.D. | Fitness Coach and Educator");
  assert.equal(post.likes, 52_000);
  assert.equal(post.comments, 7_410);
  assert.equal(post.date, "2026-03-03");
  assert.equal(post.caption, REEL_CAPTION);
  assert.equal(post.caption.split("\n").length, 7);
});

check("straight-quote opener parses", () => {
  const post = parseInstagramMeta({
    title: null,
    description: '10 likes, 2 comments - someone on May 1, 2026: "Sunset at the pier".',
  });
  assert.equal(post?.caption, "Sunset at the pier");
  assert.equal(post?.displayName, null);
});

check("singular like/comment parses", () => {
  const post = parseInstagramMeta({
    description: `1 like, 1 comment - someone on May 1, 2026: ${LDQ}Hi${RDQ}.`,
  });
  assert.equal(post?.likes, 1);
  assert.equal(post?.comments, 1);
});

check("a cleanTitle'd og:title still yields the display name", () => {
  const cleaned = cleanTitle(CAROUSEL_MICROLINK.title);
  const post = parseInstagramMeta({ ...CAROUSEL_MICROLINK, title: cleaned });
  assert.equal(post?.displayName, "Dr.kamui | Djivenson Beauplan");
});

check("display name only taken when the title's handle agrees", () => {
  const post = parseInstagramMeta({ ...CAROUSEL_MICROLINK, title: "Other (@someone.else)" });
  assert.equal(post?.handle, "dr.kamui");
  assert.equal(post?.displayName, null);
});

// ---------------------------------------------------------------- LinkPreview shape

check("carousel (linkpreview): bare caption + 'A post shared by' title", () => {
  assert.deepEqual(parseInstagramMeta(CAROUSEL_LINKPREVIEW), {
    handle: "dr.kamui",
    displayName: "Dr.kamui | Djivenson Beauplan",
    date: null,
    likes: null,
    comments: null,
    caption: CAROUSEL_CAPTION,
  });
});

check("linkpreview: microlink and linkpreview agree on the caption", () => {
  assert.equal(
    parseInstagramMeta(CAROUSEL_LINKPREVIEW)?.caption,
    parseInstagramMeta(CAROUSEL_MICROLINK)?.caption,
  );
});

// ---------------------------------------------------------------- og:title as handle source

check("account title: reel tail", () => {
  assert.deepEqual(parseAccountTitle(REEL_MICROLINK.title), {
    displayName: "Joseph Munoz Ph.D. | Fitness Coach and Educator",
    handle: "coach.jmunoz",
  });
});
check("account title: photos-and-videos tail", () => {
  assert.deepEqual(parseAccountTitle(PHOTO_MICROLINK.title), {
    displayName: "College Tennis Nation",
    handle: "ctennisnation",
  });
});
check("account title: no handle is null", () => {
  assert.equal(parseAccountTitle("Instagram"), null);
  assert.equal(parseAccountTitle(null), null);
});

// ---------------------------------------------------------------- not parsed (null)

const NOT_PARSED: [string, { title?: string | null; description?: string | null }][] = [
  ["private-media placeholder", { title: "Instagram", description: "Private media" }],
  ["empty", { title: "", description: "" }],
  ["nulls", { title: null, description: null }],
  ["bare caption without a 'shared by' title", { title: CAROUSEL_MICROLINK.title, description: CAROUSEL_CAPTION }],
  ["'shared by' title with an empty caption", { title: CAROUSEL_LINKPREVIEW.title, description: "  " }],
  ["prefix with an unquoted caption", { description: "10 likes, 2 comments - someone on May 1, 2026: Sunset." }],
  ["prefix with an empty quoted caption", { description: `10 likes, 2 comments - someone on May 1, 2026: ${LDQ}${RDQ}.` }],
  ["prefix with no caption at all", { description: "10 likes, 2 comments - someone on May 1, 2026:" }],
  ["en-dash separator", { description: `10 likes, 2 comments – someone on May 1, 2026: ${LDQ}Hi${RDQ}.` }],
  ["profile-page description", { title: "College Tennis Nation (@ctennisnation) • Instagram photos and videos", description: "120K Followers, 300 Following, 2,000 Posts - See Instagram photos and videos from College Tennis Nation (@ctennisnation)" }],
  ["tiktok-ish description", { title: "TikTok", description: "52K Likes, 300 Comments. TikTok video from someone" }],
];
for (const [name, meta] of NOT_PARSED) {
  check(`not parsed: ${name}`, () => assert.equal(parseInstagramMeta(meta), null));
}

check("unknown month still parses, with a null date", () => {
  const post = parseInstagramMeta({
    description: `10 likes, 2 comments - someone on Smarch 1, 2026: ${LDQ}Hi${RDQ}.`,
  });
  assert.equal(post?.caption, "Hi");
  assert.equal(post?.date, null);
});

// ---------------------------------------------------------------- hashtags

check("hashtags: '#'-prefixed dropped, bare-word tail kept (carousel)", () => {
  const out = stripHashtags(CAROUSEL_CAPTION);
  assert.ok(!out.includes("#"));
  assert.ok(
    out.endsWith(
      "Which anime do you think went way too far? \u{1F440} AnimeCommunity Manga AnimeMoments Weeb drkamui drkamuifr",
    ),
    out,
  );
});
check("hashtags: none to strip leaves the text alone (photo)", () => {
  assert.equal(stripHashtags(PHOTO_CAPTION), PHOTO_CAPTION);
});
check("hashtags: newlines preserved, trailing run removed (reel)", () => {
  assert.equal(
    stripHashtags(REEL_CAPTION),
    "3 mistakes killing your squat gains\n\n1. Knees caving in\n2. Rushing the descent\n" +
      "3. Skipping the warm-up\n\nSave this for leg day",
  );
});
check("hashtags: a glued '#' (C#) is not a hashtag", () => {
  assert.equal(stripHashtags("Learning C# today #coding"), "Learning C# today");
});
check("hashtags: a hashtags-only caption becomes empty", () => {
  assert.equal(stripHashtags("#a #b\n#c"), "");
});
check("hashtags: unicode hashtags", () => {
  assert.equal(stripHashtags("Café crawl #café #東京"), "Café crawl");
});

// ---------------------------------------------------------------- first sentence (the Name)

check("first sentence: carousel ends at the ellipsis", () => {
  assert.equal(firstSentence(stripHashtags(CAROUSEL_CAPTION)), "ANIME THAT WENT WAY TOO FAR…");
});
check("first sentence: photo skips 'NO. 1', truncates at a word boundary", () => {
  const name = firstSentence(stripHashtags(PHOTO_CAPTION));
  assert.equal(
    name,
    "\u{1F6A8} NEWS: Former junior WORLD NO. 1 and Roland Garros boys’ champion Gabriel…",
  );
  assert.ok(name.length <= FIRST_SENTENCE_MAX + 1);
});
check("first sentence: reel stops at the first line", () => {
  assert.equal(firstSentence(stripHashtags(REEL_CAPTION)), "3 mistakes killing your squat gains");
});
check("first sentence: plain sentences", () => {
  assert.equal(firstSentence("Best ramen in town. Go early!"), "Best ramen in town.");
  assert.equal(firstSentence("Is this the best ramen? Maybe."), "Is this the best ramen?");
  assert.equal(firstSentence("Met Dr. Smith today. Great chat."), "Met Dr. Smith today.");
  assert.equal(firstSentence("Version 2.5 is out. Update now."), "Version 2.5 is out.");
  assert.equal(firstSentence("No punctuation at all"), "No punctuation at all");
});
check("first sentence: never longer than the cap plus the ellipsis", () => {
  for (const text of [CAROUSEL_CAPTION, PHOTO_CAPTION, REEL_CAPTION, "x".repeat(300)]) {
    assert.ok(firstSentence(text).length <= FIRST_SENTENCE_MAX + 1, text);
  }
});

console.log(`\n${passed} checks passed`);
