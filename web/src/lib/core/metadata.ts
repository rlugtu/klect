import "server-only";
import { detectVideo, type DetectedVideo } from "@/lib/video";
import { comprehendMetadata, assembleDescription } from "@/lib/core/comprehend";
import { fetchPage, type PageData } from "@/lib/core/page-text";
import { structuredDataFromJsonLd } from "@/lib/core/structured-data";
import { cached } from "@/lib/core/cache";
import { searchPlaces, retrievePlace } from "@/lib/core/places";

/**
 * Link unfurl for bookmark autofill. Auth-gated by the caller. Two stages, which the
 * clients run CONCURRENTLY rather than surface as two visible steps:
 *   - {@link getLinkExtraction}: fetch the page ONCE ourselves (SSRF-guarded) and read
 *     OG/meta → title/description/images/video. Falls back to LinkPreview → Microlink
 *     when the self-fetch is blocked/empty; YouTube uses its own oEmbed. No LLM. Fast.
 *   - {@link getLinkComprehension}: from the same (cached) fetch, take a JSON-LD fast
 *     path when structured data is present (no LLM), else run Claude on the readable
 *     text (YouTube: the video description). Then geocode the location. Slow.
 *
 * Both are cached + coalesced by URL (see cache.ts), which is what makes running them
 * at once safe: comprehension's own internal extraction call joins the SAME in-flight
 * promise as a parallel extraction call, so it stays one page fetch and one unfurl,
 * not two. {@link fetchLinkMetadata} is the path the clients take — it starts both
 * together and bounds comprehension with {@link COMPREHENSION_TIMEOUT_MS}, so latency
 * is max(extraction, comprehension) and the form fills once instead of filling and
 * then visibly changing again a moment later.
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

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 min

// How long {@link fetchLinkMetadata} waits on comprehension before answering with
// extraction only. Sized to cover the JSON-LD fast path and a normal Haiku call plus
// geocode, and to cut off the tail rather than make the user watch it.
const COMPREHENSION_TIMEOUT_MS = 5000;

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
function cachedFetchPage(url: string): Promise<PageData | null> {
  return cached(`page:${url}`, CACHE_TTL_MS, () => fetchPage(url));
}

/** YouTube's own oEmbed — fast, reliable, and not rate-limited like Microlink. */
async function fetchYouTube(url: string): Promise<MetadataResult> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      { headers: { accept: "application/json" }, cache: "no-store" },
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
async function fetchLinkPreview(url: string): Promise<MetadataResult> {
  const key = process.env.LINKPREVIEW_API_KEY;
  if (!key) {
    return {
      ok: false,
      error: "LINKPREVIEW_API_KEY not set — using fallback.",
      sourceUrl: url,
    };
  }

  try {
    const res = await fetch(`https://api.linkpreview.net/?q=${encodeURIComponent(url)}`, {
      headers: { accept: "application/json", "X-Linkpreview-Api-Key": key },
      cache: "no-store",
    });

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
      title: json.title ?? null,
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
async function fetchMicrolink(url: string): Promise<MetadataResult> {
  try {
    const endpoint = `https://api.microlink.io/?url=${encodeURIComponent(
      url,
    )}&audio=false&video=true`;
    const res = await fetch(endpoint, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });

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
      title: d.title ?? null,
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
    title: page.ogTitle,
    description: page.ogDescription,
    // K excluded: keep the single-image behavior the UI expects.
    images: page.ogImages.slice(0, 1),
    video: detectVideo(url),
  }) };
}

/** Extraction only: OG/meta via self-fetch or an unfurler. Cached + coalesced by URL. No LLM. */
export async function getLinkExtraction(rawUrl: string): Promise<MetadataResult> {
  const url = normalizeUrl(rawUrl);
  if (!isHttpUrl(url)) return { ok: false, error: "Enter a valid http(s) URL.", sourceUrl: rawUrl };
  return cached(`extract:${url}`, CACHE_TTL_MS, () => extract(url));
}

async function extract(url: string): Promise<MetadataResult> {
  console.log(`[link-metadata] extracting: ${url}`);

  if (isYouTube(url)) {
    const result = await fetchYouTube(url);
    if (result.ok) return result;
    console.warn(`[link-metadata] youtube oembed failed, trying microlink: ${result.error}`);
    return fetchMicrolink(url);
  }

  if (isSocialVideo(url)) {
    // Social reels: Microlink surfaces the caption better than LinkPreview; skip
    // the self-fetch (login-walled). LinkPreview fallback.
    const result = await fetchMicrolink(url);
    if (result.ok) return result;
    console.warn(`[link-metadata] microlink failed, trying linkpreview: ${result.error}`);
    return fetchLinkPreview(url);
  }

  // Generic: our own fetch first (also warms the page cache for comprehension).
  const page = await cachedFetchPage(url);
  if (page && (page.ogTitle || page.ogDescription || page.ogImages.length)) {
    return fromPage(page, url);
  }

  // Self-fetch blocked/empty (JS-only shell, non-HTML, private host) → paid unfurlers.
  console.warn(`[link-metadata] self-fetch thin/blocked, trying linkpreview: ${url}`);
  const lp = await fetchLinkPreview(url);
  if (lp.ok) return lp;
  console.warn(`[link-metadata] linkpreview failed, trying microlink: ${lp.error}`);
  return fetchMicrolink(url);
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

/** Comprehension (JSON-LD fast path or LLM) + geocode. Cached by URL. */
export async function getLinkComprehension(rawUrl: string): Promise<LinkComprehension> {
  const url = normalizeUrl(rawUrl);
  if (!isHttpUrl(url)) return EMPTY_COMPREHENSION;
  return cached(`comprehend:${url}`, CACHE_TTL_MS, () => comprehend(url));
}

async function comprehend(url: string): Promise<LinkComprehension> {
  const extraction = await getLinkExtraction(url);
  if (!extraction.ok) return EMPTY_COMPREHENSION;
  const data = extraction.data;

  // Social is Microlink-only (login-walled) — no useful self-fetch. Everything
  // else (incl. YouTube now) fetches the page once (cached, shared with extraction).
  const page = isSocialVideo(url) ? null : await cachedFetchPage(url);

  // F/I — JSON-LD fast path: deterministic, no LLM. Only when it yields real
  // detail sections (else the LLM does a better job on prose pages).
  const structured = page ? structuredDataFromJsonLd(page.jsonLd) : null;
  if (structured && structured.details.length) {
    const description = assembleDescription(structured.description ?? "", structured.details);
    const coords = await geocodeLocation(structured.location);
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
      latitude: coords?.lat ?? null,
      longitude: coords?.lon ?? null,
    };
  }

  // No structured data + no LLM key → nothing to add.
  if (!process.env.ANTHROPIC_API_KEY) return EMPTY_COMPREHENSION;

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
  if (!refined) return EMPTY_COMPREHENSION;

  const location = refined.location || null;
  const coords = await geocodeLocation(location);
  return {
    title: refined.title || null,
    description: refined.description || null,
    tags: refined.tags.slice(0, 3),
    location,
    latitude: coords?.lat ?? null,
    longitude: coords?.lon ?? null,
  };
}

/**
 * Comprehension bounded by {@link COMPREHENSION_TIMEOUT_MS}: resolves to
 * EMPTY_COMPREHENSION if the budget runs out, which reads to the caller the same as
 * "comprehension had nothing to add". The underlying call is NOT cancelled — it keeps
 * running and populates the cache, so a retry or the next paste of the same URL gets
 * the full result for free (best-effort: a serverless instance may be frozen first).
 *
 * The `.catch()` is belt-and-braces. Comprehension swallows its own errors today, but
 * a reject here must still degrade to extraction-only rather than fail the unfurl.
 *
 * The budget is measured from the start of the unfurl, not from when extraction lands.
 * Comprehension awaits extraction internally, so a slow page eats into it on purpose:
 * it keeps the whole operation bounded by max(extraction, COMPREHENSION_TIMEOUT_MS)
 * instead of letting a slow page and a slow LLM stack up on the user.
 */
function comprehensionWithinBudget(rawUrl: string): Promise<LinkComprehension> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<LinkComprehension>((resolve) => {
    timer = setTimeout(() => {
      console.warn(
        `[link-metadata] comprehension exceeded ${COMPREHENSION_TIMEOUT_MS}ms, ` +
          `answering with extraction only: ${rawUrl}`,
      );
      resolve(EMPTY_COMPREHENSION);
    }, COMPREHENSION_TIMEOUT_MS);
  });

  return Promise.race([getLinkComprehension(rawUrl), budget])
    .catch(() => EMPTY_COMPREHENSION)
    .finally(() => clearTimeout(timer));
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
  const comprehension = comprehensionWithinBudget(rawUrl);

  const extraction = await getLinkExtraction(rawUrl);
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
