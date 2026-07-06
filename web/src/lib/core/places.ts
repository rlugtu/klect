import "server-only";

/**
 * Mapbox Search Box + Geocoding lookups, proxied server-side so the token stays
 * secret. Auth-gated by the caller (web action via requireUser, tRPC via
 * protectedProcedure) — these need no user identity, only a signed-in gate.
 */

export type PlaceSuggestion = {
  id: string; // Mapbox feature id, passed to retrievePlace to fetch coordinates
  label: string; // primary line, e.g. business/POI name or street
  address: string; // full formatted address
};

export type PlacesResult =
  | { ok: true; data: PlaceSuggestion[] }
  | { ok: false; error: string };

export type RetrievedPlace = {
  label: string;
  address: string;
  lat: number;
  lon: number;
  name: string; // business/POI name (empty for plain addresses)
  category: string; // first POI category, title-cased (e.g. "Restaurant")
  website: string; // best-effort business website from Mapbox metadata
  isPoi: boolean; // true when the feature is a point of interest (a business)
};

export type RetrieveResult =
  | { ok: true; data: RetrievedPlace }
  | { ok: false; error: string };

export type ReverseGeocodeResult =
  | { ok: true; data: { label: string; address: string } }
  | { ok: false; error: string };

const MIN_QUERY_LENGTH = 3;
const LIMIT = 6;
const SEARCHBOX_BASE = "https://api.mapbox.com/search/searchbox/v1";
const GEOCODE_BASE = "https://api.mapbox.com/search/geocode/v6";

// Mapbox Search Box /suggest result (coordinates are NOT included — see retrievePlace).
type SuggestFeature = {
  mapbox_id?: string;
  name?: string;
  place_formatted?: string;
  full_address?: string;
};

// Mapbox Geocoding v6 /reverse result: a GeoJSON FeatureCollection.
type GeocodeFeature = {
  properties?: {
    name?: string;
    full_address?: string;
    place_formatted?: string;
  };
};

// Mapbox Search Box /retrieve result: a GeoJSON FeatureCollection.
type RetrieveFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    name?: string;
    full_address?: string;
    place_formatted?: string;
    feature_type?: string;
    poi_category?: string[];
    // Undocumented but present for some POIs — best-effort only.
    metadata?: { website?: string; phone?: string };
  };
};

/** Title-case a Mapbox POI category slug, e.g. "restaurant" → "Restaurant". */
function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function mapboxToken(): string | null {
  const key = process.env.MAPBOX_TOKEN;
  if (!key) {
    console.warn("[places] MAPBOX_TOKEN not set — location search disabled.");
    return null;
  }
  return key;
}

function httpError(status: number): string {
  return status === 429
    ? "Location search rate limit reached. Try again shortly."
    : `Location search failed (${status}).`;
}

/**
 * Mapbox Search Box autocomplete (/suggest). Matches both addresses and business/POI names,
 * softly biased to the request origin via `proximity=ip`. Suggestions carry an opaque `id`
 * only; coordinates are fetched on selection via {@link retrievePlace}. `sessionToken` groups
 * a type-ahead session (suggest calls + the final retrieve) for Mapbox's session billing.
 */
export async function searchPlaces(
  text: string,
  sessionToken: string,
): Promise<PlacesResult> {
  const query = text.trim();
  if (query.length < MIN_QUERY_LENGTH) return { ok: true, data: [] };

  const key = mapboxToken();
  if (!key) return { ok: false, error: "Location search is not configured." };

  const endpoint =
    `${SEARCHBOX_BASE}/suggest?q=${encodeURIComponent(query)}` +
    `&session_token=${encodeURIComponent(sessionToken)}` +
    `&limit=${LIMIT}&language=en&proximity=ip&access_token=${key}`;

  try {
    const res = await fetch(endpoint, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      console.warn(`[places] mapbox suggest returned ${res.status} for "${query}"`);
      return { ok: false, error: httpError(res.status) };
    }

    const json = (await res.json()) as { suggestions?: SuggestFeature[] };
    const data: PlaceSuggestion[] = (json.suggestions ?? [])
      .filter((s): s is SuggestFeature & { mapbox_id: string } => !!s.mapbox_id)
      .map((s) => ({
        id: s.mapbox_id,
        label: s.name || s.full_address || s.place_formatted || "",
        address: s.full_address || s.place_formatted || s.name || "",
      }));

    console.log(`[places] "${query}" → ${data.length} suggestion(s)`);
    return { ok: true, data };
  } catch (err) {
    console.warn(`[places] suggest failed for "${query}":`, (err as Error).message);
    return { ok: false, error: `Location search failed: ${(err as Error).message}` };
  }
}

/**
 * Mapbox Search Box /retrieve — resolves a suggestion `id` into coordinates + address.
 * Must reuse the same `sessionToken` as the preceding {@link searchPlaces} calls so the
 * whole type-ahead counts as one billable session.
 */
export async function retrievePlace(
  id: string,
  sessionToken: string,
): Promise<RetrieveResult> {
  const key = mapboxToken();
  if (!key) return { ok: false, error: "Location search is not configured." };

  const endpoint =
    `${SEARCHBOX_BASE}/retrieve/${encodeURIComponent(id)}` +
    `?session_token=${encodeURIComponent(sessionToken)}&access_token=${key}`;

  try {
    const res = await fetch(endpoint, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      console.warn(`[places] mapbox retrieve returned ${res.status} for "${id}"`);
      return { ok: false, error: httpError(res.status) };
    }

    const json = (await res.json()) as { features?: RetrieveFeature[] };
    const feature = json.features?.[0];
    const coords = feature?.geometry?.coordinates;
    if (!coords || typeof coords[0] !== "number" || typeof coords[1] !== "number") {
      return { ok: false, error: "Could not resolve that place." };
    }

    const props = feature.properties ?? {};
    const category = props.poi_category?.[0] ? titleCase(props.poi_category[0]) : "";
    return {
      ok: true,
      data: {
        label: props.name || props.full_address || "",
        address: props.full_address || props.place_formatted || props.name || "",
        lat: coords[1],
        lon: coords[0],
        name: props.name || "",
        category,
        website: props.metadata?.website ?? "",
        isPoi: props.feature_type === "poi",
      },
    };
  } catch (err) {
    console.warn(`[places] retrieve failed for "${id}":`, (err as Error).message);
    return { ok: false, error: `Location lookup failed: ${(err as Error).message}` };
  }
}

/**
 * Mapbox Geocoding v6 /reverse — turns a lat/lon into a readable address. Best-effort:
 * returns `{ ok: false }` on missing token / non-OK status / no result so callers can fall
 * back to showing raw coordinates. No session token (reverse isn't part of a type-ahead session).
 */
export async function reverseGeocode(
  lat: number,
  lon: number,
): Promise<ReverseGeocodeResult> {
  const key = mapboxToken();
  if (!key) return { ok: false, error: "Location lookup is not configured." };

  const endpoint =
    `${GEOCODE_BASE}/reverse?longitude=${encodeURIComponent(lon)}` +
    `&latitude=${encodeURIComponent(lat)}&limit=1&language=en&access_token=${key}`;

  try {
    const res = await fetch(endpoint, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      console.warn(`[places] mapbox reverse returned ${res.status} for ${lat},${lon}`);
      return { ok: false, error: httpError(res.status) };
    }

    const json = (await res.json()) as { features?: GeocodeFeature[] };
    const props = json.features?.[0]?.properties;
    if (!props) return { ok: false, error: "No address found for that location." };

    const address = props.full_address || props.place_formatted || props.name || "";
    if (!address) return { ok: false, error: "No address found for that location." };

    console.log(`[places] reverse ${lat},${lon} → "${address}"`);
    return {
      ok: true,
      data: { label: props.name || props.place_formatted || address, address },
    };
  } catch (err) {
    console.warn(`[places] reverse failed for ${lat},${lon}:`, (err as Error).message);
    return { ok: false, error: `Location lookup failed: ${(err as Error).message}` };
  }
}
