import "server-only";
import { detectVideo, type DetectedVideo } from "@/lib/video";
import { comprehendMetadata, assembleDescription } from "@/lib/core/comprehend";
import { fetchPage, type PageData } from "@/lib/core/page-text";
import { structuredDataFromJsonLd } from "@/lib/core/structured-data";
import { cached } from "@/lib/core/cache";
import { cleanTitle } from "@/lib/title-clean";
import { searchPlaces, retrievePlace } from "@/lib/core/places";

/**
 * Link unfurl for bookmark autofill. Auth-gated by the caller. Two stages, which the
 * clients run CONCURRENTLY rather than surface as two visible steps:
 *   - {@link getLinkExtraction}: fetch the page ONCE ourselves (SSRF-guarded) and read
 *     OG/meta → title/description/images/video. Falls back to LinkPreview → Microlink
 *     when the self-fetch is blocked/empty; YouTube uses its own oEmbed. No LLM. Fast.
 *   - {@link getLinkComprehension}: from the same (cached) fetch, take a JSON-LD fast
 *     path when structured data is present (no LLM), else run Claude on the readable
 *     text (YouTube: the video description). Slow. Geocoding the location it inferred
 *     is a SEPARATE, separately-cached, separately-bounded tail step, so a slow Mapbox
 *     call degrades to "location string, no pin" instead of discarding the whole
 *     comprehension result.
 *
 * Both are cached + coalesced by URL (see cache.ts), which is what makes running them
 * at once safe: comprehension's own internal extraction call joins the SAME in-flight
 * promise as a parallel extraction call, so it stays one page fetch and one unfurl,
 * not two. {@link fetchLinkMetadata} is the path the clients take — it starts both
 * together against ONE {@link Deadline} ({@link UNFURL_BUDGET_MS}), so latency is
 * max(extraction, comprehension) bounded by that budget, and the form fills once
 * instead of filling and then visibly changing again a moment later.
 *
 * Every upstream fetcher here takes that same `Deadline` and asks it for
 * `slice(deadline, ownTimeout)`, so adding a hop can never extend the whole operation
 * past the budget — independent per-call timeouts would stack instead of bound.
 */

export type LinkMetadata = {
  title: string | null;
  description: string | null;
  images: string[];
  author: string | null;
  publisher: string | null;
  sourceUrl: string;
  video: DetectedVideo | null;
  // Comprehension fields; empty/null when comprehension found nothing (or timed out).
  tags: string[];
  location: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type MetadataResult =
  | { ok: true; data: LinkMetadata }
  | { ok: false; error: string; sourceUrl: string };

/** The comprehension-only fields, layered onto an extraction. */
export type LinkComprehension = {
  title: string | null;
  description: string | null;
  tags: string[];
  location: string | null;
  latitude: number | null;
  longitude: number | null;
};

const EMPTY_COMPREHENSION: LinkComprehension = {
  title: null,
  description: null,
  tags: [],
  location: null,
  latitude: null,
  longitude: null,
};

/**
 * Comprehension before coordinates: everything the JSON-LD fast path or the LLM can
 * produce on its own. Split out from {@link LinkComprehension} so the expensive,
 * flaky geocode is a tail step that can fail without taking the rest down with it.
 */
type ComprehensionText = {
  title: string | null;
  description: string | null;
  tags: string[];
  location: string | null;
};

const EMPTY_TEXT: ComprehensionText = {
  title: null,
  description: null,
  tags: [],
  location: null,
};

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 min

// One budget for the whole unfurl, created once per call in {@link fetchLinkMetadata}.
// Sized to cover the JSON-LD fast path and a normal Haiku call plus geocode, and to cut
// off the tail rather than make the user watch it.
const UNFURL_BUDGET_MS = 8_000;
const YOUTUBE_TIMEOUT_MS = 4_000;
const UNFURL_API_TIMEOUT_MS = 6_000; // LinkPreview / Microlink
const GEOCODE_TIMEOUT_MS = 3_000;
// Coordinates for a given location string don't move, so they outlive the page cache.
const GEOCODE_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * A wall-clock instant shared by every fetcher in one unfurl. Each asks for
 * `slice(deadline, ownTimeout)` and gets whichever is smaller, so the per-call timeouts
 * bound the operation rather than stacking on the user.
 */
type Deadline = { at: number };

function deadlineIn(ms: number): Deadline {
  return { at: Date.now() + ms };
}

function msLeft(d: Deadline): number {
  return Math.max(0, d.at - Date.now());
}

function slice(d: Deadline, own: number): number {
  return Math.min(own, msLeft(d));
}

/**
 * `fetch` with an AbortController timeout. Throws on abort or network error by design:
 * every caller here already wraps its fetch in a try/catch that turns a throw into
 * `{ ok: false, error }`, so no caller needs a new branch for the timeout case.
 */
async function timedFetch(
  endpoint: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(endpoint, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function isYouTube(value: string): boolean {
  try {
    const host = new URL(value).hostname.replace(/^www\./, "");
    return host === "youtube.com" || host === "youtu.be" || host === "m.youtube.com";
  } catch {
    return false;
  }
}

/**
 * Instagram / Facebook / TikTok links, where the caption (the vital info for a
 * reel) is the useful content. Microlink unfurls these better than LinkPreview,
 * so we try it first for them, and we skip the self-fetch (login-walled).
 */
function isSocialVideo(value: string): boolean {
  try {
    const host = new URL(value).hostname.replace(/^(www|m|vm)\./, "");
    return (
      host === "instagram.com" ||
      host === "facebook.com" ||
      host === "fb.watch" ||
      host === "tiktok.com"
    );
  } catch {
    return false;
  }
}

/** Cached single page fetch, shared between extraction and comprehension. */
function cachedFetchPage(url: string, deadline: Deadline): Promise<PageData | null> {
  return cached(`page:${url}`, CACHE_TTL_MS, () =>
    fetchPage(url, { budgetMs: msLeft(deadline) }),
  );
}

/** YouTube's own oEmbed — fast, reliable, and not rate-limited like Microlink. */
async function fetchYouTube(url: string, deadline: Deadline): Promise<MetadataResult> {
  if (msLeft(deadline) <= 0) {
    return { ok: false, error: "Link preview timed out.", sourceUrl: url };
  }
  try {
    const res = await timedFetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      { headers: { accept: "application/json" }, cache: "no-store" },
      slice(deadline, YOUTUBE_TIMEOUT_MS),
    );
    if (!res.ok) {
      return { ok: false, error: `YouTube oEmbed returned ${res.status}.`, sourceUrl: url };
    }
    const j = (await res.json()) as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
    };
    return { ok: true, data: baseData(url, {
      title: j.title ?? null,
      description: j.author_name ? `YouTube · ${j.author_name}` : null,
      images: j.thumbnail_url ? [j.thumbnail_url] : [],
      author: j.author_name ?? null,
      publisher: "YouTube",
    }) };
  } catch (err) {
    return {
      ok: false,
      error: `YouTube oEmbed failed: ${(err as Error).message}`,
      sourceUrl: url,
    };
  }
}

/**
 * Primary generic unfurl via the LinkPreview API (linkpreview.net). Needs
 * LINKPREVIEW_API_KEY; when unset the caller falls back to Microlink. LinkPreview
 * fetches the target server-side, avoiding SSRF.
 */
async function fetchLinkPreview(url: string, deadline: Deadline): Promise<MetadataResult> {
  if (msLeft(deadline) <= 0) {
    return { ok: false, error: "Link preview timed out.", sourceUrl: url };
  }

  const key = process.env.LINKPREVIEW_API_KEY;
  if (!key) {
    return {
      ok: false,
      error: "LINKPREVIEW_API_KEY not set — using fallback.",
      sourceUrl: url,
    };
  }

  try {
    const res = await timedFetch(
      `https://api.linkpreview.net/?q=${encodeURIComponent(url)}`,
      {
        headers: { accept: "application/json", "X-Linkpreview-Api-Key": key },
        cache: "no-store",
      },
      slice(deadline, UNFURL_API_TIMEOUT_MS),
    );

    if (!res.ok) {
      return {
        ok: false,
        error:
          res.status === 429
            ? "LinkPreview rate limit reached. Try again shortly."
            : `LinkPreview returned ${res.status}.`,
        sourceUrl: url,
      };
    }

    // Success: { title, description, image, url }. Errors come back as
    // { error: <code>, description?: string } — guard on the presence of `error`.
    const json = (await res.json()) as {
      error?: number | string;
      title?: string;
      description?: string;
      image?: string;
      url?: string;
    };

    if (json.error !== undefined || (!json.title && !json.description && !json.image)) {
      return {
        ok: false,
        error:
          typeof json.description === "string" && json.error !== undefined
            ? json.description
            : "No preview found for that link.",
        sourceUrl: url,
      };
    }

    return { ok: true, data: baseData(json.url ?? url, {
      title: cleanTitle(json.title ?? null),
      description: json.description ?? null,
      images: json.image ? [json.image] : [],
    }) };
  } catch (err) {
    return {
      ok: false,
      error: `LinkPreview request failed: ${(err as Error).message}`,
      sourceUrl: url,
    };
  }
}

/** Fallback generic unfurl via Microlink (Microlink fetches the target, avoiding SSRF). */
async function fetchMicrolink(url: string, deadline: Deadline): Promise<MetadataResult> {
  if (msLeft(deadline) <= 0) {
    return { ok: false, error: "Link preview timed out.", sourceUrl: url };
  }

  try {
    const endpoint = `https://api.microlink.io/?url=${encodeURIComponent(
      url,
    )}&audio=false&video=true`;
    const res = await timedFetch(
      endpoint,
      { headers: { accept: "application/json" }, cache: "no-store" },
      slice(deadline, UNFURL_API_TIMEOUT_MS),
    );

    if (!res.ok) {
      return {
        ok: false,
        error:
          res.status === 429
            ? "Microlink rate limit reached (free tier). Try again shortly."
            : `Microlink returned ${res.status}.`,
        sourceUrl: url,
      };
    }

    const json = (await res.json()) as {
      status?: string;
      message?: string;
      data?: {
        title?: string;
        description?: string;
        author?: string;
        publisher?: string;
        url?: string;
        image?: { url?: string };
        video?: { url?: string; type?: string };
      };
    };

    if (json.status !== "success" || !json.data) {
      return {
        ok: false,
        error: json.message ?? "No preview found for that link.",
        sourceUrl: url,
      };
    }

    const d = json.data;
    return { ok: true, data: baseData(d.url ?? url, {
      title: cleanTitle(d.title ?? null),
      description: d.description ?? null,
      images: d.image?.url ? [d.image.url] : [],
      author: d.author ?? null,
      publisher: d.publisher ?? null,
      video: detectVideo(url, d.video?.url ?? null),
    }) };
  } catch (err) {
    return {
      ok: false,
      error: `Microlink request failed: ${(err as Error).message}`,
      sourceUrl: url,
    };
  }
}

/** Build a LinkMetadata with sensible defaults; comprehension fields start empty. */
function baseData(sourceUrl: string, over: Partial<LinkMetadata>): LinkMetadata {
  return {
    title: null,
    description: null,
    images: [],
    author: null,
    publisher: null,
    sourceUrl,
    video: over.video ?? detectVideo(sourceUrl),
    tags: [],
    location: null,
    latitude: null,
    longitude: null,
    ...over,
  };
}

/** Extraction from our own single page fetch — the primary path for generic URLs. */
function fromPage(page: PageData, url: string): MetadataResult {
  return { ok: true, data: baseData(page.finalUrl || url, {
    title: cleanTitle(page.ogTitle),
    description: page.ogDescription,
    // K excluded: keep the single-image behavior the UI expects.
    images: page.ogImages.slice(0, 1),
    video: detectVideo(url),
  }) };
}

/** Extraction only: OG/meta via self-fetch or an unfurler. Cached + coalesced by URL. No LLM. */
export async function getLinkExtraction(
  rawUrl: string,
  deadline?: Deadline,
): Promise<MetadataResult> {
  const url = normalizeUrl(rawUrl);
  if (!isHttpUrl(url)) return { ok: false, error: "Enter a valid http(s) URL.", sourceUrl: rawUrl };
  const d = deadline ?? deadlineIn(UNFURL_BUDGET_MS);
  return cached(`extract:${url}`, CACHE_TTL_MS, () => extract(url, d));
}

async function extract(url: string, deadline: Deadline): Promise<MetadataResult> {
  console.log(`[link-metadata] extracting: ${url}`);

  if (isYouTube(url)) {
    const result = await fetchYouTube(url, deadline);
    if (result.ok) return result;
    console.warn(`[link-metadata] youtube oembed failed, trying microlink: ${result.error}`);
    return fetchMicrolink(url, deadline);
  }

  if (isSocialVideo(url)) {
    // Social reels: Microlink surfaces the caption better than LinkPreview; skip
    // the self-fetch (login-walled). LinkPreview fallback.
    const result = await fetchMicrolink(url, deadline);
    if (result.ok) return result;
    console.warn(`[link-metadata] microlink failed, trying linkpreview: ${result.error}`);
    return fetchLinkPreview(url, deadline);
  }

  // Generic: our own fetch first (also warms the page cache for comprehension).
  const page = await cachedFetchPage(url, deadline);
  if (page && (page.ogTitle || page.ogDescription || page.ogImages.length)) {
    return fromPage(page, url);
  }

  // Self-fetch blocked/empty (JS-only shell, non-HTML, private host) → paid unfurlers.
  console.warn(`[link-metadata] self-fetch thin/blocked, trying linkpreview: ${url}`);
  const lp = await fetchLinkPreview(url, deadline);
  if (lp.ok) return lp;
  console.warn(`[link-metadata] linkpreview failed, trying microlink: ${lp.error}`);
  return fetchMicrolink(url, deadline);
}

/**
 * Bound `p` by `ms` without cancelling it: on timeout this resolves to `fallback` while
 * the real work keeps running. That is the point, not a leak — the underlying call is
 * wrapped in `cached()`, so the result it eventually produces still lands in the cache
 * and the next paste of the same URL gets it for free.
 *
 * Callers must therefore pass the ALREADY-STARTED promise (`withBudget(cached(...), …)`),
 * never a thunk this would invoke, or the work dies with the race and nothing is warmed.
 */
function withBudget<T>(p: Promise<T>, ms: number, fallback: T, onTimeout: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      onTimeout();
      resolve(fallback);
    }, ms);
  });
  return Promise.race([p, budget])
    .catch(() => fallback)
    .finally(() => clearTimeout(timer));
}

/** searchPlaces → retrievePlace to resolve an inferred location string to coords. */
async function geocodeLocation(
  location: string | null,
): Promise<{ lat: number; lon: number } | null> {
  const q = location?.trim();
  if (!q) return null;
  try {
    const token = crypto.randomUUID();
    const s = await searchPlaces(q, token);
    if (!s.ok || !s.data.length) return null;
    const r = await retrievePlace(s.data[0].id, token);
    if (!r.ok) return null;
    return { lat: r.data.lat, lon: r.data.lon };
  } catch {
    return null;
  }
}

/**
 * Geocoding keyed by the location STRING, not the URL, and on its own longer TTL: two
 * different links about the same restaurant resolve one Mapbox pair, and a degraded
 * answer that lost the race still warms this for the retry.
 */
function cachedGeocode(location: string): Promise<{ lat: number; lon: number } | null> {
  return cached(`geo:${location.trim().toLowerCase()}`, GEOCODE_CACHE_TTL_MS, () =>
    geocodeLocation(location),
  );
}

/** The text half of comprehension, cached by URL. The single owner of this cache key. */
function cachedComprehendText(url: string, deadline: Deadline): Promise<ComprehensionText> {
  return cached(`comprehend:${url}`, CACHE_TTL_MS, () => comprehendText(url, deadline));
}

/** Comprehension (JSON-LD fast path or LLM) + geocode. Both halves cached. */
export async function getLinkComprehension(
  rawUrl: string,
  deadline?: Deadline,
): Promise<LinkComprehension> {
  const url = normalizeUrl(rawUrl);
  if (!isHttpUrl(url)) return EMPTY_COMPREHENSION;
  const d = deadline ?? deadlineIn(UNFURL_BUDGET_MS);
  const text = await cachedComprehendText(url, d);
  const coords = text.location ? await cachedGeocode(text.location) : null;
  return { ...text, latitude: coords?.lat ?? null, longitude: coords?.lon ?? null };
}

/**
 * Comprehension's text-only step: title/description/tags and the location STRING, no
 * coordinates. Resolving that string to a pin is {@link cachedGeocode}'s job, run by
 * the two callers above as a separate step.
 */
async function comprehendText(url: string, deadline: Deadline): Promise<ComprehensionText> {
  const extraction = await getLinkExtraction(url, deadline);
  if (!extraction.ok) return EMPTY_TEXT;
  const data = extraction.data;

  // Social is Microlink-only (login-walled) — no useful self-fetch. Everything
  // else (incl. YouTube now) fetches the page once (cached, shared with extraction).
  const page = isSocialVideo(url) ? null : await cachedFetchPage(url, deadline);

  // F/I — JSON-LD fast path: deterministic, no LLM. Only when it yields real
  // detail sections (else the LLM does a better job on prose pages).
  const structured = page ? structuredDataFromJsonLd(page.jsonLd) : null;
  if (structured && structured.details.length) {
    const description = assembleDescription(structured.description ?? "", structured.details);
    console.log(`[comprehend] json-ld fast path for ${url}:`, {
      name: structured.name,
      location: structured.location,
      sections: structured.details.map((d) => d.heading),
    });
    return {
      title: structured.name || null,
      description: description || null,
      tags: [],
      location: structured.location || null,
    };
  }

  // No structured data + no LLM key → nothing to add.
  if (!process.env.ANTHROPIC_API_KEY) return EMPTY_TEXT;

  // H — YouTube: feed the video description; generic: the readable text.
  const pageText = isYouTube(url) ? (page?.ogDescription ?? null) : (page?.readableText ?? null);

  const refined = await comprehendMetadata({
    title: data.title,
    description: isYouTube(url) ? null : data.description,
    url: data.sourceUrl,
    publisher: data.publisher,
    author: data.author,
    pageText,
  });
  if (!refined) return EMPTY_TEXT;

  return {
    title: refined.title || null,
    description: refined.description || null,
    tags: refined.tags.slice(0, 3),
    location: refined.location || null,
  };
}

/**
 * Comprehension as TWO separately-bounded steps drawing from the same {@link Deadline}:
 * the text step gets whatever is left of the unfurl budget, then geocoding gets
 * `min(GEOCODE_TIMEOUT_MS, what's left)`. Losing either race degrades instead of
 * failing — a blown text budget reads to the caller as "comprehension had nothing to
 * add", and a blown geocode budget still returns title/description/tags and the
 * location string with no pin, where one shared budget would have thrown all of it away.
 *
 * Neither underlying call is cancelled: both keep running inside `cached()`, so a
 * retry or the next paste of the same URL gets the full result for free (best-effort —
 * a serverless instance may be frozen first).
 *
 * The budget is measured from the start of the unfurl, not from when extraction lands.
 * Comprehension awaits extraction internally, so a slow page eats into it on purpose:
 * it keeps the whole operation bounded by {@link UNFURL_BUDGET_MS} instead of letting a
 * slow page and a slow LLM stack up on the user.
 */
async function comprehensionWithinBudget(
  rawUrl: string,
  deadline: Deadline,
): Promise<LinkComprehension> {
  const url = normalizeUrl(rawUrl);
  const text = await withBudget(
    cachedComprehendText(url, deadline),
    msLeft(deadline),
    EMPTY_TEXT,
    () =>
      console.warn(
        `[link-metadata] comprehension text step exceeded budget, ` +
          `answering with extraction only: ${rawUrl}`,
      ),
  );

  const location = text.location;
  if (!location) return { ...text, latitude: null, longitude: null };

  const coords = await withBudget(
    cachedGeocode(location),
    slice(deadline, GEOCODE_TIMEOUT_MS),
    null,
    () => console.warn(`[link-metadata] geocode exceeded budget: ${location}`),
  );
  return { ...text, latitude: coords?.lat ?? null, longitude: coords?.lon ?? null };
}

/**
 * One-shot unfurl: extraction and comprehension merged. This is what both clients call.
 *
 * Both start together — no await between them — so the cost is max(extraction,
 * comprehension), not the sum. That's safe because comprehension calls
 * {@link getLinkExtraction} itself and `cached()` coalesces in-flight calls by key:
 * the two extractions are one execution, so no duplicate page fetch, no duplicate
 * LinkPreview/Microlink spend, no doubled rate-limit pressure.
 *
 * Extraction decides the outcome. A failed extraction returns immediately and whatever
 * comprehension produces is discarded — a clear error shouldn't wait on a slow LLM.
 */
export async function fetchLinkMetadata(rawUrl: string): Promise<MetadataResult> {
  // ONE deadline for both halves. They must share the same object, or `cached()`'s
  // in-flight coalescing stops collapsing the two extraction calls into one page
  // fetch and one unfurl.
  const deadline = deadlineIn(UNFURL_BUDGET_MS);
  const comprehension = comprehensionWithinBudget(rawUrl, deadline);

  const extraction = await getLinkExtraction(rawUrl, deadline);
  if (!extraction.ok) {
    console.warn(`[link-metadata] result for ${rawUrl}:`, { ok: false, error: extraction.error });
    return extraction;
  }

  const c = await comprehension;
  // Clone so we never mutate the cached extraction object.
  const data: LinkMetadata = { ...extraction.data };
  if (c.title) data.title = c.title;
  if (c.description) data.description = c.description;
  data.tags = c.tags.slice(0, 3);
  data.location = c.location;
  data.latitude = c.latitude;
  data.longitude = c.longitude;

  console.log(`[link-metadata] result for ${rawUrl}:`, {
    ok: true,
    title: data.title,
    description: data.description?.slice(0, 80) ?? null,
    images: data.images,
    publisher: data.publisher,
    video: data.video,
    tags: data.tags,
    location: data.location,
    coords: data.latitude != null ? [data.latitude, data.longitude] : null,
  });

  return { ok: true, data };
}
