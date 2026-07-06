import "server-only";
import { detectVideo, type DetectedVideo } from "@/lib/video";

/**
 * Link unfurl for bookmark autofill. Auth-gated by the caller. YouTube uses its
 * own oEmbed (fast, not rate-limited); everything else uses Microlink (which
 * fetches the target, avoiding SSRF).
 */

export type LinkMetadata = {
  title: string | null;
  description: string | null;
  images: string[];
  author: string | null;
  publisher: string | null;
  sourceUrl: string;
  video: DetectedVideo | null;
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

/** Generic unfurl via Microlink (Microlink fetches the target, avoiding SSRF). */
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
 * Unfurl a pasted link to prefill the bookmark form. YouTube uses its own
 * oEmbed (with Microlink as a fallback); everything else uses Microlink.
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
  } else {
    result = await fetchMicrolink(url);
  }

  if (result.ok) {
    console.log(`[link-metadata] result for ${url}:`, {
      ok: true,
      title: result.data.title,
      description: result.data.description?.slice(0, 80) ?? null,
      images: result.data.images,
      publisher: result.data.publisher,
      video: result.data.video,
    });
  } else {
    console.warn(`[link-metadata] result for ${url}:`, {
      ok: false,
      error: result.error,
    });
  }

  return result;
}
