/** Geo helpers for the "near me" feature. Distances are in miles (US-biased app). */

/** Selectable search radii for the nearby finder, in miles. */
export const NEARBY_RANGES_MI = [0.5, 1, 2, 5, 10] as const;

const EARTH_RADIUS_MI = 3958.7613;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance between two lat/lon points, in miles (haversine). */
export function haversineMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_MI * 2 * Math.asin(Math.sqrt(a));
}

/** Human-readable distance, e.g. `0.3 mi` / `2.4 mi`. */
export function formatMiles(mi: number): string {
  return `${mi.toFixed(1)} mi`;
}

/** Fallback readout of a coordinate pair, e.g. `37.7749°, -122.4194°`. */
export function formatCoords(lat: number, lon: number): string {
  return `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;
}
