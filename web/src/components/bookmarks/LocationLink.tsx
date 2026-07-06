"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MapPin, ChevronDown } from "lucide-react";

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

/** Apple Maps only has a native experience on Apple devices (iPhone/iPad/Mac). */
function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iP(hone|ad|od)/.test(navigator.userAgent);
}

type MapOption = { label: string; href: string };

/**
 * Tappable location that hands off to a maps app with the place pre-loaded (pin/search
 * view). The available apps are detected per device: Apple platforms get a chooser
 * (Apple Maps + Google Maps); everywhere else opens Google Maps directly. Uses stored
 * coordinates for an exact pin, falling back to the location text as a search query.
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
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<MapOption[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape while the menu is open.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Built at click time (platform detection is browser-only, so it can't run during SSR).
  function buildOptions(): MapOption[] {
    const opts: MapOption[] = [];
    if (isApplePlatform()) {
      opts.push({ label: "Apple Maps", href: appleUrl(location, lat, lon) });
    }
    opts.push({ label: "Google Maps", href: googleUrl(location, lat, lon) });
    return opts;
  }

  function handleTrigger() {
    const opts = buildOptions();
    // Only one app available — skip the menu and open it straight away.
    if (opts.length === 1) {
      window.open(opts[0].href, "_blank", "noopener,noreferrer");
      return;
    }
    setOptions(opts);
    setOpen((o) => !o);
  }

  return (
    <div ref={ref} className="relative inline-block max-w-full">
      <button
        type="button"
        onClick={handleTrigger}
        aria-haspopup="menu"
        aria-expanded={open}
        className="text-muted hover:text-primary inline-flex max-w-full cursor-pointer items-center gap-1.5 underline-offset-2 hover:underline"
      >
        <MapPin size={14} aria-hidden className="shrink-0" />
        <span className="truncate">{location}</span>
        <ChevronDown size={12} aria-hidden className="shrink-0 opacity-60" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            role="menu"
            // High z-index so the menu floats above any surrounding page chrome.
            className="pixel-box bg-panel absolute z-[1200] mt-2 min-w-[12rem] overflow-hidden p-1"
          >
            {options.map((o) => (
              <a
                key={o.label}
                href={o.href}
                target="_blank"
                rel="noopener noreferrer"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="hover:bg-primary/15 flex cursor-pointer items-center gap-2 px-3 py-2 text-sm"
              >
                <MapPin size={14} aria-hidden className="shrink-0" />
                {o.label}
              </a>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
