import { Pressable, Text, View } from 'react-native';

const PX = { md: 24, sm: 16 } as const;

// Apple's 44pt minimum touch target. Half-star granularity means ten tap zones in one row,
// which can't each be 44pt wide (that's wider than any phone), so each *star* gets a 44x44
// cell and its two halves get 22x44, the widest a half can be without stealing taps from
// the next star. The cells tile with no gap, so the row is exactly 5 x 44pt.
const TAP = 44;

/**
 * 0–5 star rating with half steps. Interactive when `onChange` is given — each
 * star splits into two tap zones (left half → n−0.5, right half → n), and
 * tapping the current rating again clears it to 0; otherwise read-only display.
 * Each star renders a muted ☆ with an accent ★ clipped to its fill fraction, so
 * halves show a left-filled star. Used by the bookmark detail view, the add/edit
 * form, and (read-only, `size="sm"`) the list card so they all match.
 */
export default function RatingStars({
  value,
  onChange,
  size = 'md',
}: {
  value: number;
  onChange?: (rating: number) => void;
  size?: 'md' | 'sm';
}) {
  const interactive = typeof onChange === 'function';
  const px = PX[size];
  const clamped = Math.min(5, Math.max(0, value));
  const glyph = { fontSize: px, lineHeight: px * 1.15 };

  return (
    <View className={`flex-row items-center ${interactive ? '' : 'gap-1'}`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = Math.min(1, Math.max(0, clamped - (n - 1)));
        const half = n - 0.5;
        return (
          <View
            key={n}
            className="relative items-center justify-center"
            style={interactive ? { width: TAP, height: TAP } : undefined}>
            {/* Inner wrapper hugs the glyph, so the fill clip below stays glued to the
                star itself rather than to the (wider) tap cell. */}
            <View className="relative">
              <Text className="text-muted" style={glyph}>
                ☆
              </Text>
              {/* Accent star clipped to the fill fraction (0 / 50% / 100%). */}
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: 0,
                  width: `${fill * 100}%`,
                  overflow: 'hidden',
                }}
                pointerEvents="none">
                <Text className="text-accent" style={glyph}>
                  ★
                </Text>
              </View>
            </View>
            {interactive && (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${half} stars`}
                  onPress={() => onChange!(half === value ? 0 : half)}
                  style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '50%' }}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`}
                  onPress={() => onChange!(n === value ? 0 : n)}
                  style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: '50%' }}
                />
              </>
            )}
          </View>
        );
      })}
    </View>
  );
}
