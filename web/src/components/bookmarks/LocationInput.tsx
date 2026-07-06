"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { PixelInput } from "@/components/ui/PixelInput";
import {
  searchPlaces,
  retrievePlace,
  type PlaceSuggestion,
  type RetrievedPlace,
} from "@/lib/actions/places";

const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 350;

/**
 * Location field with address / business autocomplete (Mapbox Search Box, proxied
 * server-side). Renders the visible input plus hidden `location`/`latitude`/`longitude`
 * inputs so the bookmark form submits by name. Free typing clears the coordinates (the
 * text no longer matches a pin); picking a suggestion resolves its coordinates via a
 * second `retrieve` call and fills them. A per-session token ties the suggest+retrieve
 * calls together for Mapbox's session billing.
 */
export function LocationInput({
  initialLocation = "",
  initialLat = null,
  initialLon = null,
  onAutofill,
}: {
  initialLocation?: string;
  initialLat?: number | null;
  initialLon?: number | null;
  // Called after a successful retrieve so the parent form can autofill from a
  // picked business. Purely additive — location/coords are still set here.
  onAutofill?: (place: RetrievedPlace) => void;
}) {
  const [query, setQuery] = useState(initialLocation);
  const [lat, setLat] = useState<number | null>(initialLat);
  const [lon, setLon] = useState<number | null>(initialLon);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // Ignore responses that arrive after a newer request, and skip refetching a query
  // we just resolved (e.g. the address set programmatically after a pick, or the initial
  // value on an edit-form mount).
  const reqId = useRef(0);
  const lastFetched = useRef<string | null>(initialLocation.trim() || null);
  // Groups suggest + the final retrieve into one Mapbox billing session; rotated after
  // each pick (a session ends once retrieve resolves).
  const sessionToken = useRef<string>(crypto.randomUUID());

  useEffect(() => {
    const q = query.trim();
    const handle = setTimeout(async () => {
      if (q.length < MIN_QUERY_LENGTH) {
        setSuggestions([]);
        setError(null);
        lastFetched.current = null;
        return;
      }
      if (q === lastFetched.current) return; // unchanged (or just-picked) — no refetch

      const id = ++reqId.current;
      lastFetched.current = q;
      const result = await searchPlaces(q, sessionToken.current);
      if (id !== reqId.current) return; // a newer request superseded this one
      if (result.ok) {
        setSuggestions(result.data);
        setError(null);
      } else {
        setSuggestions([]);
        setError(result.error);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [query]);

  async function pick(s: PlaceSuggestion) {
    // Fill the text and close immediately; coordinates arrive from the retrieve call.
    lastFetched.current = s.address.trim(); // prevent the query-change effect from refetching
    setQuery(s.address);
    setLat(null);
    setLon(null);
    setSuggestions([]);
    setError(null);
    setOpen(false);

    const result = await retrievePlace(s.id, sessionToken.current);
    // Rotate the session token — this suggest→retrieve session is complete.
    sessionToken.current = crypto.randomUUID();

    if (result.ok) {
      // Keep the fuller address Mapbox returns on retrieve, if present.
      if (result.data.address) {
        lastFetched.current = result.data.address.trim();
        setQuery(result.data.address);
      }
      setLat(result.data.lat);
      setLon(result.data.lon);
      onAutofill?.(result.data);
    } else {
      // No coordinates — the text still submits and LocationLink falls back to a search.
      setError(result.error);
    }
  }

  const showDropdown =
    open && query.trim().length >= MIN_QUERY_LENGTH && (suggestions.length > 0 || !!error);

  return (
    <div className="relative">
      {/* Hidden inputs carry the values into the form submission. */}
      <input type="hidden" name="location" value={query} />
      <input type="hidden" name="latitude" value={lat ?? ""} />
      <input type="hidden" name="longitude" value={lon ?? ""} />

      <PixelInput
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          // Free typing means the text no longer matches the picked pin.
          setLat(null);
          setLon(null);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Search a place or business…"
        aria-label="Location"
        autoComplete="off"
      />

      {showDropdown && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.12 }}
          className="pixel-box bg-panel absolute z-10 mt-2 max-h-80 w-full overflow-auto p-2"
          // Keep focus on the input so option clicks register before blur.
          onMouseDown={(e) => e.preventDefault()}
        >
          {error ? (
            <p className="text-muted p-2 text-sm">{error}</p>
          ) : (
            suggestions.map((s, i) => (
              <button
                key={`${s.id},${i}`}
                type="button"
                onClick={() => void pick(s)}
                className="hover:bg-primary/15 flex w-full flex-col gap-0.5 px-2 py-1.5 text-left cursor-pointer"
              >
                <span className="truncate">{s.label}</span>
                <span className="text-muted truncate text-sm">{s.address}</span>
              </button>
            ))
          )}
        </motion.div>
      )}
    </div>
  );
}
