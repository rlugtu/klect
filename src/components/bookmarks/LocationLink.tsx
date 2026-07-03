"use client";

import { MapPin, ExternalLink } from "lucide-react";

/** Google Maps universal URL — opens the app if installed, else web; works everywhere. */
function googleUrl(location: string, lat: number | null, lon: number | null): string {
  const query = lat != null && lon != null ? `${lat},${lon}` : location;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** Apple Maps URL — `ll` centers a labeled (`q`) pin; `q` alone searches the text. */
function appleUrl(location: string, lat: number | null, lon: number | null): string {
  const params = new URLSearchParams();
  if (lat != null && lon != null) {
    params.set("ll", `${lat},${lon}`);
    if (location) params.set("q", location);
  } else {
    params.set("q", location);
  }
  return `https://maps.apple.com/?${params.toString()}`;
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ reports a "Macintosh" UA, so treat a touch-capable Mac as iOS too.
  return /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/**
 * Tappable location that hands off to a native maps app with the place pre-loaded.
 * The `href` is the Google Maps universal URL — correct on any platform with no JS.
 * On iOS we intercept the click and open Apple Maps instead, so iPhone/iPad users get
 * their default app.
 */
export function LocationLink({
  location,
  lat = null,
  lon = null,
}: {
  location: string;
  lat?: number | null;
  lon?: number | null;
}) {
  return (
    <a
      href={googleUrl(location, lat, lon)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        if (isIOS()) {
          e.preventDefault();
          window.open(appleUrl(location, lat, lon), "_blank", "noopener,noreferrer");
        }
      }}
      className="text-muted hover:text-primary inline-flex max-w-full items-center gap-1.5 underline-offset-2 hover:underline"
    >
      <MapPin size={14} aria-hidden className="shrink-0" />
      <span className="truncate">{location}</span>
      <ExternalLink size={12} aria-hidden className="shrink-0 opacity-60" />
    </a>
  );
}
