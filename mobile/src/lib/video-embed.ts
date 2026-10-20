// Render-side trusted-host whitelist for the bookmark video player — a mirror of
// web's `src/lib/video.ts` (the source of truth that also builds these URLs). The
// backend already detected the video and stored `videoUrl`/`videoType`; here we only
// re-check the host before mounting a WebView, as defense-in-depth.
//
// NB: named `video-embed` (not `video`) on purpose — `@/lib/video` resolves to web's
// `src/lib/video.ts` via the shared `@/*` path fallback, so this must not shadow it.

/** Hosts we allow to load inside the embed WebView. Web constructs these URLs. */
export const TRUSTED_IFRAME_HOSTS = new Set([
  'www.youtube-nocookie.com',
  'player.vimeo.com',
  'www.tiktok.com',
  'www.instagram.com',
]);

/** Extract the hostname without relying on RN's partial `URL` implementation. */
function hostOf(url: string): string | null {
  const m = url.match(/^https?:\/\/([^/?#]+)/i);
  return m ? m[1].toLowerCase() : null;
}

export function isTrustedIframeUrl(url: string): boolean {
  const host = hostOf(url);
  return host != null && TRUSTED_IFRAME_HOSTS.has(host);
}

/** TikTok/Instagram embeds are vertical (9:16); YouTube/Vimeo are 16:9. */
export function isPortraitVideoHost(url: string): boolean {
  const host = hostOf(url);
  if (!host) return false;
  return host.includes('tiktok.com') || host.includes('instagram.com');
}

/**
 * A still thumbnail for a bookmark that has a video but no extracted image — so
 * the list card shows a poster instead of the placeholder. Derived from the
 * stored embed URL (which web's `detectVideo` built), never from a live fetch.
 * Only YouTube exposes an official ID-addressable thumbnail; other providers
 * (Vimeo/TikTok/Instagram) and direct files return null → placeholder fallback.
 */
export function videoPosterUrl(videoUrl: string, videoType: string): string | null {
  if (videoType !== 'iframe' || !videoUrl) return null;
  const yt = videoUrl.match(/youtube(?:-nocookie)?\.com\/embed\/([A-Za-z0-9_-]{11})/);
  if (yt) return `https://img.youtube.com/vi/${yt[1]}/hqdefault.jpg`;
  return null;
}
