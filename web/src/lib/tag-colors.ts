/**
 * Tag color palette + helpers. Colors are fixed hex values rendered with a
 * luminance-computed text color, so a tag looks the same and stays legible
 * across all four themes (pixel/modern × light/dark).
 *
 * NOTE: keep TAG_COLORS in sync with the backfill array in the
 * `add_tag_color` migration.
 */
export const TAG_COLORS = [
  "#e43b44", // red
  "#f77622", // orange
  "#ffb02e", // amber
  "#f9c74f", // yellow
  "#3fa34d", // green
  "#2a9d8f", // teal
  "#4f6df5", // blue
  "#5a67d8", // indigo
  "#9b5de5", // purple
  "#e84c9a", // pink
  "#c77dff", // lavender
  "#8d6e63", // brown
] as const;

/** A random palette color not in `avoid`; falls back to any color if all used. */
export function randomTagColor(avoid: string[] = []): string {
  const available = TAG_COLORS.filter((c) => !avoid.includes(c));
  const pool = available.length > 0 ? available : TAG_COLORS;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Near-black or near-white text, whichever contrasts better with `hex`. */
export function tagTextColor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#1c1c22";
  const int = parseInt(m[1], 16);
  const r = (int >> 16) & 0xff;
  const g = (int >> 8) & 0xff;
  const b = int & 0xff;
  // Relative luminance (sRGB, perceptual weights).
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#1c1c22" : "#ffffff";
}
