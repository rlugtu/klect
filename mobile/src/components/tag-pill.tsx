import { Pressable, Text, View } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';

type Props = {
  name: string;
  /** The tag's stored hex color. Legacy tags store "" and fall back to a neutral pill. */
  color?: string;
  /** When given the pill is tappable — used to toggle the tag in a filter. */
  onPress?: () => void;
  /** Draws the pill as currently active in that filter. */
  selected?: boolean;
};

const HEX_RE = /^#[0-9a-f]{6}$/i;

/**
 * Near-black or near-white label, whichever contrasts better with the pill fill.
 * Mirrors web's `tagTextColor` (web/src/lib/tag-colors.ts) so the same tag reads
 * identically on both clients; the fills are fixed hex values, not theme tokens,
 * so the label can't come from a theme token either.
 */
function labelColor(hex: string): string {
  const int = parseInt(hex.slice(1), 16);
  const r = (int >> 16) & 0xff;
  const g = (int >> 8) & 0xff;
  const b = int & 0xff;
  // Relative luminance (sRGB, perceptual weights).
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#1c1c22' : '#ffffff';
}

/**
 * A tag as a lowercase #hashtag pill filled with the tag's own stored color (design.md:
 * "same per-tag colored pills," fully rounded, no border), matching web. A tag with no
 * stored color keeps a neutral panel fill. The leading "#" is display-only; tags are
 * stored lowercase and without it.
 */
export default function TagPill({ name, color, onPress, selected = false }: Props) {
  const t = THEME_TOKENS[useTheme().theme];
  const hex = color?.trim() ?? '';
  const fill = HEX_RE.test(hex) ? hex : null;
  const label = `#${name.toLowerCase()}`;

  const pillStyle = {
    backgroundColor: fill ?? t.panel,
    // Always drawn, transparent until selected, so toggling never shifts the row.
    borderWidth: 1.5,
    borderColor: selected ? t.ink : 'transparent',
  };
  const textStyle = { color: fill ? labelColor(fill) : t.muted };

  if (!onPress) {
    return (
      <View className="rounded-skin-sm px-2 py-0.5" style={pillStyle}>
        <Text className="font-sans text-sm" style={textStyle}>
          {label}
        </Text>
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${selected ? 'Clear' : 'Filter by'} ${label}`}
      hitSlop={6}
      onPress={onPress}
      className="rounded-skin-sm px-2 py-0.5"
      style={pillStyle}>
      <Text className="font-sans text-sm" style={textStyle}>
        {label}
      </Text>
    </Pressable>
  );
}
