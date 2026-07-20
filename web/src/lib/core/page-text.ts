import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Best-effort server-side fetch of a page, for the comprehension layer. We fetch
 * the HTML **once** and derive everything from it: OG/meta metadata, JSON-LD
 * structured data, and readable text. Unlike LinkPreview/Microlink (which fetch
 * the target on their side, avoiding SSRF), this fetches from our server — so it
 * is guarded:
 *   - http(s) only
 *   - the host must not resolve to a loopback/private/link-local/reserved address
 *   - redirects are followed manually (max 2), re-validating each hop's host
 *   - a request timeout, an html-only content-type check, and a byte cap
 * Any guard trip or failure returns `null` so the caller falls back to metadata.
 */

const TIMEOUT_MS = 5000;
const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 2;
const MAX_TEXT_CHARS = 4000;

export type PageData = {
  finalUrl: string;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImages: string[];
  jsonLd: unknown[];
  readableText: string;
};

function ipToInt(ip: string): number {
  return ip.split(".").reduce((acc, oct) => (acc << 8) + Number(oct), 0) >>> 0;
}

/** Loopback / private / link-local / reserved ranges we must never fetch. */
function isPrivateIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) {
    const n = ipToInt(ip);
    const inRange = (base: string, bits: number) =>
      (n >>> (32 - bits)) === (ipToInt(base) >>> (32 - bits));
    return (
      inRange("10.0.0.0", 8) ||
      inRange("172.16.0.0", 12) ||
      inRange("192.168.0.0", 16) ||
      inRange("127.0.0.0", 8) ||
      inRange("169.254.0.0", 16) || // link-local (incl. cloud metadata 169.254.169.254)
      inRange("0.0.0.0", 8) ||
      inRange("100.64.0.0", 10) || // CGNAT
      n === 0xffffffff // 255.255.255.255
    );
  }
  if (kind === 6) {
    const addr = ip.toLowerCase();
    // IPv4-mapped (::ffff:a.b.c.d) — check the embedded v4.
    const mapped = addr.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return (
      addr === "::1" ||
      addr === "::" ||
      addr.startsWith("fc") || // fc00::/7 unique-local
      addr.startsWith("fd") ||
      addr.startsWith("fe8") || // fe80::/10 link-local
      addr.startsWith("fe9") ||
      addr.startsWith("fea") ||
      addr.startsWith("feb")
    );
  }
  return true; // unparseable → treat as unsafe
}

/** True only for a public http(s) URL whose host resolves to public address(es). */
async function isSafePublicUrl(raw: string): Promise<URL | null> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const host = url.hostname;
  // If the host is a literal IP, check it directly; otherwise resolve every A/AAAA.
  if (isIP(host)) {
    return isPrivateIp(host) ? null : url;
  }
  try {
    const addrs = await lookup(host, { all: true });
    if (!addrs.length) return null;
    if (addrs.some((a) => isPrivateIp(a.address))) return null;
    return url;
  } catch {
    return null;
  }
}

/** Decode the handful of HTML entities we care about (shared by text + meta parse). */
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/gi, "'")
    .replace(/&#x0*27;/gi, "'")
    .replace(/&#x0*2f;/gi, "/");
}

/** Strip HTML to plain-ish text without pulling in jsdom/readability. */
function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|head|template)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}

/** Read a single attribute value (double/single/unquoted) off a tag string. */
function attr(tag: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const m = tag.match(re);
  if (!m) return null;
  return decodeEntities(m[2] ?? m[3] ?? m[4] ?? "").trim();
}

/**
 * Build a map of `<meta>` property/name → content (first occurrence wins), plus
 * collect every og:image / twitter:image as an ordered list.
 */
function parseMeta(html: string): { map: Map<string, string>; images: string[] } {
  const map = new Map<string, string>();
  const images: string[] = [];
  const metaRe = /<meta\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = metaRe.exec(html))) {
    const tag = m[0];
    const key = (attr(tag, "property") ?? attr(tag, "name") ?? attr(tag, "itemprop"))?.toLowerCase();
    const content = attr(tag, "content");
    if (!key || content == null || content === "") continue;
    if (key === "og:image" || key === "og:image:url" || key === "og:image:secure_url" || key === "twitter:image") {
      images.push(content);
    }
    if (!map.has(key)) map.set(key, content);
  }
  return { map, images };
}

function parseTitleTag(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1]).trim() || null : null;
}

/** Extract + JSON.parse every `<script type="application/ld+json">` block. */
function parseJsonLd(html: string): unknown[] {
  const out: unknown[] = [];
  const re =
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = m[1].trim();
    if (!raw) continue;
    try {
      out.push(JSON.parse(raw));
    } catch {
      // Malformed JSON-LD is common; ignore and keep going.
    }
  }
  return out;
}

/** Resolve possibly-relative image URLs against the final URL; keep http(s), dedupe. */
function resolveImages(images: string[], base: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of images) {
    try {
      const abs = new URL(raw, base).href;
      if (!/^https?:\/\//i.test(abs) || seen.has(abs)) continue;
      seen.add(abs);
      out.push(abs);
    } catch {
      // skip unparseable
    }
  }
  return out;
}

/** Read a Response body as text, aborting once MAX_BYTES is exceeded. */
async function readCappedText(res: Response): Promise<string | null> {
  const body = res.body;
  if (!body) return null;
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > MAX_BYTES) {
          await reader.cancel();
          break; // keep what we have — enough for comprehension
        }
        chunks.push(value);
      }
    }
  } catch {
    return null;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(
    concatChunks(chunks, Math.min(total, MAX_BYTES)),
  );
}

function concatChunks(chunks: Uint8Array[], size: number): Uint8Array {
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    if (offset + c.byteLength > size) {
      out.set(c.subarray(0, size - offset), offset);
      break;
    }
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/** SSRF-guarded fetch of a page's HTML, following redirects manually. */
async function fetchHtml(startUrl: string): Promise<{ finalUrl: string; html: string } | null> {
  let current = startUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const safe = await isSafePublicUrl(current);
    if (!safe) {
      console.warn(`[page-text] blocked non-public/invalid url: ${current}`);
      return null;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(safe.href, {
        headers: {
          accept: "text/html,application/xhtml+xml",
          "user-agent": "KlectBot/1.0 (+bookmark autofill)",
        },
        redirect: "manual",
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (err) {
      clearTimeout(timer);
      console.warn(`[page-text] fetch failed for ${safe.href}: ${(err as Error).message}`);
      return null;
    }
    clearTimeout(timer);

    // Manual redirect handling — re-validate the next hop's host.
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return null;
      current = new URL(loc, safe.href).href;
      continue;
    }

    if (!res.ok) {
      console.warn(`[page-text] ${safe.href} returned ${res.status}.`);
      return null;
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      console.warn(`[page-text] ${safe.href} is not html (${contentType}).`);
      return null;
    }

    const html = await readCappedText(res);
    if (!html) return null;
    return { finalUrl: safe.href, html };
  }

  console.warn(`[page-text] too many redirects from ${startUrl}`);
  return null;
}

/**
 * Fetch a page once and derive OG/meta metadata, JSON-LD, and readable text from
 * the single HTML response. Returns `null` on any guard trip or fetch failure.
 */
export async function fetchPage(startUrl: string): Promise<PageData | null> {
  const fetched = await fetchHtml(startUrl);
  if (!fetched) return null;
  const { finalUrl, html } = fetched;

  const { map, images } = parseMeta(html);
  const ogTitle =
    map.get("og:title") ?? map.get("twitter:title") ?? parseTitleTag(html) ?? null;
  const ogDescription =
    map.get("og:description") ?? map.get("twitter:description") ?? map.get("description") ?? null;
  const ogImages = resolveImages(images, finalUrl);
  const jsonLd = parseJsonLd(html);
  const readableText = htmlToText(html);

  console.log(
    `[page-text] parsed ${finalUrl}: title=${Boolean(ogTitle)} desc=${Boolean(
      ogDescription,
    )} images=${ogImages.length} jsonLd=${jsonLd.length} text=${readableText.length}ch`,
  );

  return {
    finalUrl,
    ogTitle: ogTitle ? ogTitle.trim() || null : null,
    ogDescription: ogDescription ? ogDescription.trim() || null : null,
    ogImages,
    jsonLd,
    readableText,
  };
}

/**
 * Back-compat thin wrapper: just the readable text from a single page fetch.
 * Prefer {@link fetchPage} when you also need metadata/JSON-LD.
 */
export async function fetchReadableText(startUrl: string): Promise<string | null> {
  const page = await fetchPage(startUrl);
  return page?.readableText || null;
}
