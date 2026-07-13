import "server-only";
import { detectVideo, type DetectedVideo } from "@/lib/video";
import { comprehendMetadata } from "@/lib/core/comprehend";
import { fetchReadableText } from "@/lib/core/page-text";

/**
 * Link unfurl for bookmark autofill. Auth-gated by the caller. YouTube uses its
 * own oEmbed (fast, not rate-limited); everything else uses the LinkPreview API
 * (primary) with Microlink as a fallback — both fetch the target server-side,
 * avoiding SSRF.
 */

export type LinkMetadata = {
  title: string | null;
  description: string | null;
  images: string[];
  author: string | null;
  publisher: string | null;
  sourceUrl: string;
  video: DetectedVideo | null;
  // Comprehension layer (claude-haiku-4-5) output; empty/null when the LLM is
  // unavailable (no ANTHROPIC_API_KEY) or the call fails.
  tags: string[];
  location: string | null;
};

export type MetadataResult =
  | { ok: true; data: LinkMetadata }
  | { ok: false; error: string; sourceUrl: string };

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
 * so we try it first for them. Note: the full caption is often still truncated or
 * login-walled — reliable caption extraction needs a social-scraper API.
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
    return {
      ok: true,
      data: {
        title: j.title ?? null,
        description: j.author_name ? `YouTube · ${j.author_name}` : null,
        images: j.thumbnail_url ? [j.thumbnail_url] : [],
        author: j.author_name ?? null,
        publisher: "YouTube",
        sourceUrl: url,
        video: detectVideo(url),
        tags: [],
        location: null,
      },
    };
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

    return {
      ok: true,
      data: {
        title: json.title ?? null,
        description: json.description ?? null,
        images: json.image ? [json.image] : [],
        author: null,
        publisher: null,
        sourceUrl: json.url ?? url,
        video: detectVideo(url),
        tags: [],
        location: null,
      },
    };
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
    return {
      ok: true,
      data: {
        title: d.title ?? null,
        description: d.description ?? null,
        images: d.image?.url ? [d.image.url] : [],
        author: d.author ?? null,
        publisher: d.publisher ?? null,
        sourceUrl: d.url ?? url,
        video: detectVideo(url, d.video?.url ?? null),
        tags: [],
        location: null,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: `Microlink request failed: ${(err as Error).message}`,
      sourceUrl: url,
    };
  }
}

/**
 * Unfurl a pasted link to prefill the bookmark form. YouTube uses its own oEmbed
 * (with Microlink as a fallback); everything else uses LinkPreview (primary) with
 * Microlink as a fallback.
 */
export async function fetchLinkMetadata(rawUrl: string): Promise<MetadataResult> {
  const url = normalizeUrl(rawUrl);
  console.log(`[link-metadata] ingesting: ${url}`);

  if (!isHttpUrl(url)) {
    console.warn(`[link-metadata] invalid url: ${rawUrl}`);
    return { ok: false, error: "Enter a valid http(s) URL.", sourceUrl: rawUrl };
  }

  let result: MetadataResult;
  if (isYouTube(url)) {
    result = await fetchYouTube(url);
    if (!result.ok) {
      console.warn(`[link-metadata] youtube oembed failed, trying microlink: ${result.error}`);
      result = await fetchMicrolink(url);
    }
  } else if (isSocialVideo(url)) {
    // Social reels: Microlink surfaces the caption better than LinkPreview, and
    // the caption is the useful content — so prefer it, with LinkPreview fallback.
    result = await fetchMicrolink(url);
    if (!result.ok) {
      console.warn(`[link-metadata] microlink failed, trying linkpreview: ${result.error}`);
      result = await fetchLinkPreview(url);
    }
  } else {
    result = await fetchLinkPreview(url);
    if (!result.ok) {
      console.warn(`[link-metadata] linkpreview failed, trying microlink: ${result.error}`);
      result = await fetchMicrolink(url);
    }
  }

  // Comprehension layer: refine the raw metadata into clean bookmark fields
  // (name/description) plus suggested tags and a location. Best-effort — a null
  // result (no ANTHROPIC_API_KEY, refusal, or failure) leaves the raw extraction
  // untouched, so autofill still works.
  if (result.ok) {
    // Fetch the page's readable text so comprehension can pull out vital details
    // (steps/ingredients/etc.). Best-effort and only worthwhile when comprehension
    // will actually run (key set) and the target is an article, not a video shell.
    const pageText =
      process.env.ANTHROPIC_API_KEY && !isYouTube(url) && !result.data.video
        ? await fetchReadableText(result.data.sourceUrl)
        : null;

    const refined = await comprehendMetadata({
      title: result.data.title,
      description: result.data.description,
      url: result.data.sourceUrl,
      publisher: result.data.publisher,
      author: result.data.author,
      pageText,
    });
    if (refined) {
      if (refined.title) result.data.title = refined.title;
      if (refined.description) result.data.description = refined.description;
      // At most 3 recommended tags — never padded up to 3 (see comprehend.ts).
      result.data.tags = refined.tags.slice(0, 3);
      result.data.location = refined.location || null;
    }
  }

  if (result.ok) {
    console.log(`[link-metadata] result for ${url}:`, {
      ok: true,
      title: result.data.title,
      description: result.data.description?.slice(0, 80) ?? null,
      images: result.data.images,
      publisher: result.data.publisher,
      video: result.data.video,
      tags: result.data.tags,
      location: result.data.location,
    });
  } else {
    console.warn(`[link-metadata] result for ${url}:`, {
      ok: false,
      error: result.error,
    });
  }

  return result;
}
