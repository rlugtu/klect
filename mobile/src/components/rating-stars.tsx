import { Pressable, Text, View } from 'react-native';

/**
 * 0–5 star rating. Interactive when `onChange` is given (tap a star to set it,
 * tap the current rating again to clear to 0); otherwise read-only display.
 * Used by both the bookmark detail view and the add/edit form so they match.
 */
export default function RatingStars({
  value,
  onChange,
}: {
  value: number;
  onChange?: (rating: number) => void;
}) {
  const interactive = typeof onChange === 'function';

  return (
    <View className="flex-row items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => {
        const star = (
          <Text
            key={n}
            className={`text-2xl ${n <= value ? 'text-accent' : 'text-muted'}`}>
            {n <= value ? '★' : '☆'}
          </Text>
        );
        return interactive ? (
          <Pressable
            key={n}
            hitSlop={4}
            accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`}
            onPress={() => onChange!(n === value ? 0 : n)}>
            {star}
          </Pressable>
        ) : (
          star
        );
      })}
    </View>
  );
}
