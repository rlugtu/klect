# Bookmark video: detect a playable video during autofill + optional inline player

> **Status: ✅ implemented (2026-07-03).** Shipped per this plan; kept for reference.

## Context
The autofill flow (`fetchLinkMetadata`) already extracts title/description/images/source from a
pasted URL but **ignores video**. Users paste YouTube/TikTok/Instagram/Vimeo/blog links; when the
link is a playable video we want to **detect it during autofill**, store it on the bookmark, and
render an **optional click-to-play** inline player on the bookmark detail page.

**Decisions (with the user):**
- Sources: **YouTube, Vimeo, direct video files (og:video/.mp4/.webm), TikTok, Instagram**
  (user accepted TikTok/IG are less reliable).
- **Detect at autofill + store** on the bookmark (two columns) — not derive-at-render.
- Security: we **construct the official embed URL ourselves** from the parsed video ID/shortcode
  and only render `<iframe>` for a **whitelist of trusted hosts** — never inject provider HTML.
  Click-to-play, **no autoplay on page load**.

## Approach

**A. Schema** — `prisma/schema.prisma`, add to `model Bookmark`:
`videoUrl String @default("")` and `videoType String @default("")` (`"" | "iframe" | "file"`).
Then `npx prisma migrate dev --name add_bookmark_video` → **`npx prisma generate`** → restart dev
(Prisma 7 doesn't regenerate on migrate). Provider + aspect are derived from the host at render,
so no other columns are needed.

**B. New shared module `src/lib/video.ts`** (pure TS, no `"use server"` — imported by the metadata
action, the bookmarks action, and the client component so the whitelist lives in one place):
- `type DetectedVideo = { type: "iframe" | "file"; url: string }`.
- `TRUSTED_IFRAME_HOSTS = {www.youtube-nocookie.com, player.vimeo.com, www.tiktok.com, www.instagram.com}`;
  `isTrustedIframeUrl(url)`; `isPortraitVideoHost(url)` (true for tiktok/instagram).
- `detectVideo(sourceUrl, microlinkVideoUrl?) : DetectedVideo | null` — provider parse first:
  - YouTube `/(?:youtu\.be\/|\/shorts\/|\/embed\/|\/live\/|[?&]v=)([A-Za-z0-9_-]{11})/` →
    `https://www.youtube-nocookie.com/embed/{id}`.
  - Vimeo: last numeric path segment → `https://player.vimeo.com/video/{id}`.
  - TikTok `/\/video\/(\d+)/` (long form only; `vm.tiktok.com`/`/t/` short links → `null`) →
    `https://www.tiktok.com/player/v1/{id}`.
  - Instagram `/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/` → `https://www.instagram.com/p/{code}/embed`.
  - else if `microlinkVideoUrl` (https) → `{ type:"file", url }`; else `null`.

**C. `src/lib/actions/metadata.ts`** — add `video: DetectedVideo | null` to `LinkMetadata`.
`fetchMicrolink`: change `&audio=false&video=false` → **`&audio=false&video=true`**, extend the
typed `data` with `video?: { url?: string; type?: string }`, set
`video: detectVideo(url, d.video?.url ?? null)`. `fetchYouTube`: set `video: detectVideo(url)`.
Failure/non-video paths carry `video: null`; include `video` in the `[link-metadata]` success log.

**D. New `src/components/bookmarks/BookmarkVideo.tsx`** (`"use client"`), props
`{ videoUrl, videoType, poster }`:
- `file` → `<video controls preload="metadata" poster={poster}>` framed in `pixel-box-sm`.
- `iframe` → guard with `isTrustedIframeUrl` (return null if not whitelisted); container aspect
  `aspect-video` or portrait `aspect-[9/16] max-w-[340px] mx-auto`; **facade** (poster `<img>` +
  ▶ button) until clicked; on click mount the `<iframe>` with `autoplay=1` appended,
  `allow="… autoplay; encrypted-media; picture-in-picture; fullscreen"`, `allowFullScreen`,
  `referrerPolicy="strict-origin-when-cross-origin"`, `loading="lazy"`.

**E. `src/components/bookmarks/BookmarkForm.tsx`** — add `videoUrl/videoType` to `BookmarkDefaults`
+ `useState`; in `autofill()` set them from `result.data.video` (mirror the images capture);
render hidden `<input name="videoUrl">` / `<input name="videoType">` when present; add a
"🎬 Video detected — remove" affordance (mirrors the image × remove) that clears both.

**F. `src/lib/actions/bookmarks.ts`** — add `videoUrl/videoType` to `BookmarkFields`; in
`parseBookmarkFields` read both and apply a **server-side whitelist guard**: keep only if
(`type==="file"` && `https://…`) or (`type==="iframe"` && `isTrustedIframeUrl(url)`), else set both
`""`. create/update already spread `...fields`.

**G. Detail page `src/app/lists/[id]/bookmarks/[bid]/page.tsx`** — add `videoUrl/videoType` to
`editDefaults`; render `{bookmark.videoUrl && <BookmarkVideo videoUrl videoType
poster={bookmark.images[0]} />}` in the hero **between the images grid and the description**.
(`getBookmarkForUser` uses `findUnique`+`include`, so the new columns come through automatically.)

## Verified embed facts (from planning research)
- **TikTok** `player/v1` iframe is standalone — no `embed.js`/blockquote script required.
- **Instagram** `/embed` iframe works without an access token for public posts (renders a card
  with header/caption chrome, minor letterboxing).
- **Microlink** returns `data.video = { url, type, ... }` only when called with `video=true`
  (default is `false`).
- Short links (`vm.tiktok.com`, `tiktok.com/t/...`) can't be resolved without following redirects
  → store no video.

## Critical files
- `prisma/schema.prisma` (migration)
- `src/lib/video.ts` (new) — shared detect + whitelist + aspect
- `src/lib/actions/metadata.ts` (add detection to autofill)
- `src/components/bookmarks/BookmarkVideo.tsx` (new) — facade player
- `src/lib/actions/bookmarks.ts` (parse + server guard)
- also: `src/components/bookmarks/BookmarkForm.tsx`, `src/app/lists/[id]/bookmarks/[bid]/page.tsx`

## Verification
1. Edit schema → `migrate dev` → `prisma generate` → restart; then `npm run build`, `npm run lint`,
   `npx tsc --noEmit`.
2. Autofill each: YouTube (`watch?v=` and `youtu.be`/`/shorts/`), Vimeo `vimeo.com/{id}`, TikTok
   `@user/video/{id}`, Instagram `/reel/{code}/`, and a direct `.mp4`/og:video page →
   confirm detection populates the "🎬 Video detected" affordance; **remove** clears it; saved
   values persist.
3. Detail page: **click-to-play does not autoplay on load**; YouTube/Vimeo render 16:9, TikTok/IG
   portrait; direct file uses native `<video controls>`.
4. `vm.tiktok.com` short link → **no** video stored. Tamper a stored iframe URL to a
   non-whitelisted host → server guard clears it / component refuses to render.
5. Edit a **pre-migration** bookmark (empty `videoUrl`) → no player, saves cleanly.

## Risks / notes
- TikTok/Instagram embeds can still fail (login walls, private/removed posts) → the existing
  "Open ↗" primary-URL button stays as the fallback.
- Whitelist enforced on **both** write (action) and render (component); `youtube-nocookie` for privacy.
- No CSP today; if one is added later it must include `frame-src` for the 4 hosts (+ `media-src`/
  `img-src` for direct-file + poster hosts).
- `video=true` makes Microlink slightly heavier / uses a bit more of the free quota — only matters
  for the non-provider (direct-file) path.
