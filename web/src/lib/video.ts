// Playable-video detection + embed helpers. Pure (no server-only deps) so it can be
// imported by server actions AND the client player component — the trusted-host
// whitelist lives here so both write-side and render-side use one source of truth.

export type DetectedVideo = { type: "iframe" | "file"; url: string };

/** Hosts we allow to render inside an <iframe>. We build these URLs ourselves. */
export const TRUSTED_IFRAME_HOSTS = new Set([
  "www.youtube-nocookie.com",
  "player.vimeo.com",
  "www.tiktok.com",
  "www.instagram.com",
]);

export function isTrustedIframeUrl(url: string): boolean {
  try {
    return TRUSTED_IFRAME_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** TikTok/Instagram embeds are vertical; YouTube/Vimeo are 16:9. */
export function isPortraitVideoHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host.includes("tiktok.com") || host.includes("instagram.com");
  } catch {
    return false;
  }
}

function baseHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").replace(/^m\./, "");
  } catch {
    return null;
  }
}

/**
 * Detect a playable video from a source URL (and an optional Microlink og:video
 * file URL). Known providers → an embed iframe URL we construct; otherwise a
 * direct media file. Returns null for anything unrecognized (incl. short links).
 */
export function detectVideo(
  sourceUrl: string,
  microlinkVideoUrl?: string | null,
): DetectedVideo | null {
  const host = baseHost(sourceUrl);

  if (host === "youtube.com" || host === "youtu.be") {
    const m = sourceUrl.match(
      /(?:youtu\.be\/|\/shorts\/|\/embed\/|\/live\/|[?&]v=)([A-Za-z0-9_-]{11})/,
    );
    if (m) {
      return { type: "iframe", url: `https://www.youtube-nocookie.com/embed/${m[1]}` };
    }
  }

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const digits = safePathname(sourceUrl).match(/\d+/g);
    const id = digits?.[digits.length - 1];
    if (id) return { type: "iframe", url: `https://player.vimeo.com/video/${id}` };
  }

  // Long-form TikTok only; vm.tiktok.com / tiktok.com/t/ short links can't be resolved.
  if (host === "tiktok.com") {
    const m = sourceUrl.match(/\/video\/(\d+)/);
    if (m) return { type: "iframe", url: `https://www.tiktok.com/player/v1/${m[1]}` };
  }

  if (host === "instagram.com") {
    const m = sourceUrl.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
    if (m) return { type: "iframe", url: `https://www.instagram.com/p/${m[1]}/embed` };
  }

  if (microlinkVideoUrl && /^https:\/\//i.test(microlinkVideoUrl)) {
    return { type: "file", url: microlinkVideoUrl };
  }

  return null;
}

function safePathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}
