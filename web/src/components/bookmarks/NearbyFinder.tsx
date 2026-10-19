"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type MouseEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Maximize2, X } from "lucide-react";
import { PixelButton } from "@/components/ui/PixelButton";
import { LockedBadge } from "@/components/entitlements/LockedState";
import { BookmarkCard } from "./BookmarkCard";
import { cn } from "@/lib/utils";
import { isDesktopViewport, isTypingTarget } from "@/lib/client-prefs";
import { NEARBY_RANGES_MI, formatMiles, formatCoords } from "@/lib/geo";
import { findNearbyBookmarks, type NearbyBookmark } from "@/lib/actions/nearby";
import { reverseGeocode } from "@/lib/actions/places";
import { BookmarkThumb } from "./BookmarkThumb";

type Status = "idle" | "locating" | "searching" | "done" | "error";

// GeolocationPositionError codes → friendly copy.
const GEO_ERRORS: Record<number, string> = {
  1: "Location permission denied. Enable it to find nearby bookmarks.",
  2: "Your location is unavailable right now. Try again.",
  3: "Timed out getting your location. Try again.",
};

/**
 * Near me: radius and list controls, the browser location prompt, and the
 * results, closest first.
 *
 * Below lg this is the original single column (cards link to the full
 * bookmark page). At lg and up it is a split: controls and a compact results
 * list on the left, and on the right the selected result's detail, the same
 * server-rendered `BookmarkPanelContent` the list page's side panel uses.
 * Selecting a row sets `?b=<id>` on /nearby (the page reads that bookmark with
 * the usual permission and lock derivation and passes it in as `detail`); the
 * results are client state that survives that navigation. Opening pushes one
 * history entry, switching replaces it, closing pops it, as on the list page.
 *
 * There is no map: a web map is blocked on the public Mapbox token decision
 * (desktop strategy, Open Decision 3), and no map slot is rendered until then.
 */
export function NearbyFinder({
  listOptions,
  selectedId = null,
  detail = null,
  selectedHref = null,
}: {
  listOptions: { id: string; name: string; icon: string }[];
  /** `?b=` from the URL (desktop selection), or null. */
  selectedId?: string | null;
  /** Server-rendered detail for `selectedId`; null when unreadable or none. */
  detail?: ReactNode;
  /** Full bookmark page for the selection. */
  selectedHref?: string | null;
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

  // ---- Desktop selection (lg+): ?b=<id> on /nearby ----
  const router = useRouter();
  const [opening, startOpening] = useTransition();
  const pushedRef = useRef(false);
  const paneRef = useRef<HTMLElement>(null);

  const select = useCallback(
    (id: string) => {
      if (id === selectedId) return;
      const href = `/nearby?b=${encodeURIComponent(id)}`;
      startOpening(() => {
        if (selectedId) {
          router.replace(href, { scroll: false });
        } else {
          pushedRef.current = true;
          router.push(href, { scroll: false });
        }
      });
    },
    [router, selectedId],
  );

  const closeSelection = useCallback(() => {
    if (pushedRef.current) {
      pushedRef.current = false;
      router.back();
      return;
    }
    startOpening(() => router.replace("/nearby", { scroll: false }));
  }, [router]);

  function onRowClick(e: MouseEvent<HTMLAnchorElement>, id: string) {
    // Modified and middle clicks keep their browser meaning (new tab, window).
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!isDesktopViewport()) return;
    e.preventDefault();
    select(id);
  }

  // Focus moves into the detail pane when a selection opens, and back to its
  // row when it closes.
  const prevSelected = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevSelected.current;
    prevSelected.current = selectedId;
    if (!isDesktopViewport()) return;
    if (selectedId && !prev) {
      paneRef.current?.focus({ preventScroll: true });
    } else if (!selectedId && prev) {
      pushedRef.current = false;
      document
        .querySelector<HTMLElement>(`[data-nearby-row="${prev}"]`)
        ?.focus({ preventScroll: true });
    }
  }, [selectedId]);

  // Esc closes the detail (not a character key, so not behind the shortcuts
  // setting). Ignored while typing or while a dialog is open.
  useEffect(() => {
    if (!selectedId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (!isDesktopViewport() || isTypingTarget(e.target)) return;
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      closeSelection();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedId, closeSelection]);

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
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] lg:items-start lg:gap-8">
      <div className="flex flex-col gap-6 lg:min-w-0">
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
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:hidden">
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
                {/* lg+: compact rows that open the detail pane beside them. */}
                <ol className="pixel-box-sm bg-panel divide-border hidden flex-col divide-y overflow-hidden lg:flex">
                  {results.map((r, i) => (
                    <li key={r.card.id}>
                      <NearbyRow
                        result={r}
                        index={i}
                        active={r.card.id === selectedId}
                        onClick={(e) => onRowClick(e, r.card.id)}
                      />
                    </li>
                  ))}
                </ol>
              </>
            )}
          </section>
        )}
      </div>

      {/* lg+ detail pane. No map slot: see the component comment. */}
      <section
        ref={paneRef}
        tabIndex={-1}
        aria-label={selectedId ? "Selected bookmark" : "Bookmark detail"}
        aria-busy={opening}
        className={cn(
          "pixel-box bg-panel hidden flex-col outline-none transition-opacity lg:sticky lg:top-20 lg:flex lg:max-h-[calc(100dvh-6.5rem)] lg:min-w-0",
          opening && "opacity-70",
        )}
      >
        {selectedId ? (
          <>
            <div className="border-border flex shrink-0 items-center justify-end gap-1 border-b px-3 py-2">
              {selectedHref && (
                <Link
                  href={selectedHref}
                  title="Open full page"
                  aria-label="Open full page"
                  className="text-muted hover:text-ink inline-flex size-8 items-center justify-center"
                >
                  <Maximize2 size={16} aria-hidden />
                </Link>
              )}
              <button
                type="button"
                onClick={closeSelection}
                title="Close (Esc)"
                aria-label="Close bookmark detail"
                className="text-muted hover:text-ink inline-flex size-8 cursor-pointer items-center justify-center"
              >
                <X size={18} aria-hidden />
              </button>
            </div>
            <div key={selectedId} className="min-h-0 flex-1 overflow-y-auto p-5">
              {detail ?? (
                <p className="text-muted py-10 text-center text-sm">
                  This bookmark is not available. It may have been deleted, or you may
                  no longer be a member of its list.
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 px-8 py-16 text-center">
            <span aria-hidden className="text-3xl">
              📍
            </span>
            <p className="text-ink font-semibold">
              {status === "done" && results.length > 0
                ? "Pick a result to see it here"
                : status === "done"
                  ? "Nothing nearby yet"
                  : "Your nearby bookmarks show up here"}
            </p>
            <p className="text-muted max-w-sm text-sm">
              {status === "done" && results.length > 0
                ? "Photos, notes, rating and comments open beside the list, so you can compare places without leaving the results."
                : status === "done"
                  ? "Try a wider range or more lists."
                  : "Choose a range and lists, then find bookmarks near your current location."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

/** One compact result row (lg+): rank, photo, name, list, distance. */
function NearbyRow({
  result,
  index,
  active,
  onClick,
}: {
  result: NearbyBookmark;
  index: number;
  active: boolean;
  onClick: (e: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const { card } = result;
  return (
    <Link
      href={`/lists/${result.listId}/bookmarks/${card.id}`}
      data-nearby-row={card.id}
      aria-current={active ? "true" : undefined}
      onClick={onClick}
      className={cn(
        "hover:bg-ink/5 flex min-w-0 items-center gap-3 px-3 py-2.5",
        active && "bg-primary/10 outline-primary outline-2 -outline-offset-2",
      )}
    >
      <span
        aria-hidden
        className="bg-primary text-primary-ink flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
      >
        {index + 1}
      </span>
      <BookmarkThumb
        images={card.images ?? [card.image]}
        url={card.url}
        name={card.name}
        locked={card.locked}
        size="sm"
        className="pixel-box-sm size-11"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className={cn("font-pixel min-w-0 truncate text-sm", card.locked && "text-muted")}>
            {card.name}
          </span>
          {card.locked && <LockedBadge className="px-1.5 py-0" />}
        </span>
        <span className="text-muted truncate text-sm">
          in {result.listLabel.icon} {result.listLabel.name}
        </span>
      </span>
      <span className="text-muted shrink-0 text-sm whitespace-nowrap">
        {formatMiles(result.distanceMiles)}
      </span>
    </Link>
  );
}
