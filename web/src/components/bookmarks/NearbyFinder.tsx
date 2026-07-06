"use client";

import { useState } from "react";
import { PixelButton } from "@/components/ui/PixelButton";
import { BookmarkCard } from "./BookmarkCard";
import { cn } from "@/lib/utils";
import { NEARBY_RANGES_MI, formatMiles, formatCoords } from "@/lib/geo";
import { findNearbyBookmarks, type NearbyBookmark } from "@/lib/actions/nearby";
import { reverseGeocode } from "@/lib/actions/places";

type Status = "idle" | "locating" | "searching" | "done" | "error";

// GeolocationPositionError codes → friendly copy.
const GEO_ERRORS: Record<number, string> = {
  1: "Location permission denied — enable it to find nearby bookmarks.",
  2: "Your location is unavailable right now. Try again.",
  3: "Timed out getting your location. Try again.",
};

export function NearbyFinder({
  listOptions,
}: {
  listOptions: { id: string; name: string; icon: string }[];
}) {
  const [radiusMiles, setRadiusMiles] = useState(5);
  const [selectedListIds, setSelectedListIds] = useState<string[]>(
    listOptions.map((l) => l.id),
  );
  const [status, setStatus] = useState<Status>("idle");
  const [results, setResults] = useState<NearbyBookmark[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [searchedRadius, setSearchedRadius] = useState(5);
  const [locationLabel, setLocationLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allSelected = selectedListIds.length === listOptions.length;
  const noneSelected = selectedListIds.length === 0;
  const busy = status === "locating" || status === "searching";

  function toggleList(id: string) {
    setSelectedListIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    );
  }

  function findNearby() {
    setError(null);
    setLocationLabel(null);
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setStatus("error");
      setError("Geolocation isn't supported in this browser.");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setStatus("searching");
        const { latitude: lat, longitude: lon } = pos.coords;
        const usedRadius = radiusMiles;
        // Resolve the readable address alongside the search so it adds no serial latency.
        const [res, place] = await Promise.all([
          findNearbyBookmarks({
            lat,
            lon,
            radiusMiles: usedRadius,
            listIds: selectedListIds,
          }),
          reverseGeocode(lat, lon),
        ]);
        setLocationLabel(place.ok ? place.data.address : formatCoords(lat, lon));
        if (res.ok) {
          setResults(res.data);
          setSkipped(res.skipped);
          setSearchedRadius(usedRadius);
          setStatus("done");
        } else {
          setError(res.error);
          setStatus("error");
        }
      },
      (err) => {
        setError(GEO_ERRORS[err.code] ?? "Couldn't get your location.");
        setStatus("error");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Controls */}
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="font-pixel text-sm font-bold text-muted">Range</span>
          <select
            value={radiusMiles}
            onChange={(e) => setRadiusMiles(Number(e.target.value))}
            className="pixel-box-sm bg-panel text-ink w-full cursor-pointer px-2 py-2.5 text-base"
          >
            {NEARBY_RANGES_MI.map((mi) => (
              <option key={mi} value={mi}>
                Within {mi} mi
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-pixel text-sm font-bold text-muted">Lists</span>
            <button
              type="button"
              onClick={() =>
                setSelectedListIds(allSelected ? [] : listOptions.map((l) => l.id))
              }
              className="text-muted hover:text-primary cursor-pointer text-sm"
            >
              {allSelected ? "Clear all" : "Select all"}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {listOptions.map((l) => {
              const on = selectedListIds.includes(l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => toggleList(l.id)}
                  aria-pressed={on}
                  className={cn(
                    "border-border bg-panel hover:border-primary flex cursor-pointer items-center gap-1.5 border-2 px-2 py-1 text-sm",
                    on && "border-primary bg-primary/20",
                  )}
                >
                  <span aria-hidden>{l.icon}</span>
                  <span className="max-w-[10rem] truncate">{l.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <PixelButton
          type="button"
          onClick={findNearby}
          disabled={busy || noneSelected}
        >
          📍{" "}
          {status === "locating"
            ? "Locating…"
            : status === "searching"
              ? "Searching…"
              : "Find near me"}
        </PixelButton>

        {noneSelected && (
          <p className="text-muted text-sm">Select at least one list to search.</p>
        )}
        {status === "error" && error && (
          <p className="text-danger text-sm">{error}</p>
        )}
      </div>

      {/* Results */}
      {status === "done" && (
        <section className="flex flex-col gap-4">
          {locationLabel && (
            <div className="pixel-box-sm bg-panel flex items-start gap-2 px-3 py-2.5">
              <span aria-hidden className="text-lg leading-none">
                📍
              </span>
              <div className="flex flex-col">
                <span className="font-pixel text-muted text-xs font-bold">
                  Your location
                </span>
                <span className="text-ink text-sm">{locationLabel}</span>
              </div>
            </div>
          )}
          <h2 className="font-pixel text-sm">
            {results.length} bookmark{results.length === 1 ? "" : "s"} within{" "}
            {searchedRadius} mi
          </h2>
          {skipped > 0 && (
            <p className="text-muted text-sm">
              {skipped} bookmark{skipped === 1 ? "" : "s"} with a location but no
              precise coordinates {skipped === 1 ? "was" : "were"} skipped.
            </p>
          )}
          {results.length === 0 ? (
            <p className="text-muted">No bookmarks within {searchedRadius} mi.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {results.map((r) => (
                <BookmarkCard
                  key={r.card.id}
                  listId={r.listId}
                  listLabel={r.listLabel}
                  distanceLabel={`${formatMiles(r.distanceMiles)} away`}
                  bookmark={r.card}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
