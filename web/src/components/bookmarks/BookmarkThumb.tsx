"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";
import { RemoteImg } from "@/components/ui/RemoteImg";
import { LOCKED_ART } from "@/components/entitlements/LockedState";
import { cn } from "@/lib/utils";

/** How many photos a thumbnail tries before it gives up on photos. */
const MAX_CANDIDATES = 4;

const MARK_SIZE = {
  sm: { icon: "size-5", text: "text-base", glyph: 16 },
  md: { icon: "size-7", text: "text-xl", glyph: 20 },
  lg: { icon: "size-9", text: "text-3xl", glyph: 26 },
} as const;

export type BookmarkThumbSize = keyof typeof MARK_SIZE;

/** `https://host/favicon.ico` for an http(s) link, or null. */
function faviconFor(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return `https://${u.host}/favicon.ico`;
  } catch {
    return null;
  }
}

/**
 * The one bookmark thumbnail: cards, compact rows, list-card photo strips, Near
 * me rows, shared-bookmark cards in DMs and poll options all render this.
 *
 * Bookmark photos are hotlinked remote URLs and many of them break (hotlink
 * protection, expired signed CDN links, removed images). So:
 * 1. try each photo in order (`images`, then the next one when a load fails);
 * 2. when none loads (or there are none), draw a designed tile: the themed tint
 *    with the site's favicon (from the bookmark's first link), else the name's
 *    first letter, else a link glyph. Never the browser's broken-image icon.
 *
 * The frame is a fixed-size box set by `className` (height and width), and the
 * photo and the tile both fill it absolutely, so a failure never shifts layout.
 */
export function BookmarkThumb({
  images,
  url,
  name,
  className,
  locked = false,
  size = "md",
  loading = "lazy",
}: {
  /** Candidate photo URLs, best first (usually the bookmark's `images`). */
  images: readonly (string | null | undefined)[];
  /** The bookmark's primary link, for the favicon fallback. */
  url?: string | null;
  /** The bookmark's name, for the initial fallback. */
  name?: string | null;
  /** Frame classes: size (h/w or size-*), border skin (e.g. pixel-box-sm). */
  className?: string;
  locked?: boolean;
  size?: BookmarkThumbSize;
  loading?: "lazy" | "eager";
}) {
  const candidates = [
    ...new Set(images.filter((s): s is string => typeof s === "string" && s.trim() !== "")),
  ].slice(0, MAX_CANDIDATES);
  const key = candidates.join("\n");
  // Index of the photo being tried; reset whenever the candidate list changes.
  const [attempt, setAttempt] = useState({ key, index: 0 });
  const index = attempt.key === key ? attempt.index : 0;
  const src = candidates[index];

  return (
    <span
      aria-hidden
      className={cn(
        "relative block shrink-0 overflow-hidden",
        src ? "bg-panel" : "shell-thumb-empty",
        className,
        locked && LOCKED_ART,
      )}
    >
      {src ? (
        <RemoteImg
          key={src}
          src={src}
          loading={loading}
          onFail={() => setAttempt({ key, index: index + 1 })}
          className="absolute inset-0 block size-full object-cover"
        />
      ) : (
        <ThumbMark url={url} name={name} size={size} />
      )}
    </span>
  );
}

/** The fallback mark centered on the tile: favicon, else initial, else a link glyph. */
function ThumbMark({
  url,
  name,
  size,
}: {
  url?: string | null;
  name?: string | null;
  size: BookmarkThumbSize;
}) {
  const favicon = faviconFor(url);
  const [faviconFailed, setFaviconFailed] = useState<string | null>(null);
  const m = MARK_SIZE[size];
  const initial = name?.trim().charAt(0).toLocaleUpperCase();

  return (
    <span className="text-primary absolute inset-0 flex items-center justify-center">
      {favicon && faviconFailed !== favicon ? (
        // A white chip behind the favicon: favicons are drawn for light browser
        // tabs, so a dark mark stays legible on the dark themes' tint.
        <span className="flex items-center justify-center rounded-md bg-white p-1 shadow-sm">
          <RemoteImg
            key={favicon}
            src={favicon}
            onFail={() => setFaviconFailed(favicon)}
            className={cn("block object-contain", m.icon)}
          />
        </span>
      ) : initial ? (
        <span className={cn("font-pixel leading-none font-bold", m.text)}>{initial}</span>
      ) : (
        <Link2 size={m.glyph} />
      )}
    </span>
  );
}
