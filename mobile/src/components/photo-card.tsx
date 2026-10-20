import { type ReactNode, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { LOCKED_OPACITY } from '@/components/locked-badge';
import { cardShadow } from '@/theme/shadows';

type Props = {
  /** First extracted image URL; a warm placeholder tile is shown when absent. */
  image?: string | null;
  /** Shown if `image` is absent or fails to load (e.g. a hotlink-blocked reel
   * thumbnail), typically a derived video poster. */
  fallbackImage?: string | null;
  placeholderEmoji?: string;
  onPress?: () => void;
  /**
   * Fades the photo only, for a locked (read-only) bookmark. The card
   * surface and `onPress` are untouched on purpose: locked means read-only, not
   * hidden, so the card must still open. Caller dims its own `children`.
   */
  dimmed?: boolean;
  /** Content rendered below the photo (title, meta, tags…). */
  children: ReactNode;
};

/**
 * Journal photo-forward card: a landscape photo (or warm placeholder) with a
 * "print border" and soft shadow, and a content slot below. Used for the in-list
 * bookmark feed (Home's list tiles are `list-tile.tsx`).
 */
export default function PhotoCard({
  image,
  fallbackImage,
  placeholderEmoji = '🔖',
  onPress,
  dimmed = false,
  children,
}: Props) {
  // Walk candidates on load error: image → fallbackImage → placeholder. Reset
  // when the inputs change, since FlatList recycles card instances.
  const candidates = [image, fallbackImage].filter(Boolean) as string[];
  const [stage, setStage] = useState(0);
  useEffect(() => setStage(0), [image, fallbackImage]);
  const src = candidates[stage] ?? null;

  return (
    <Pressable
      // No label: the card's own children (title, meta, tags) are what VoiceOver
      // should read, and a Pressable collects them automatically.
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      style={cardShadow}
      className="overflow-hidden rounded-skin border-skin border-border bg-panel">
      {/* p-1.5 leaves a panel-colored "print border" around the photo */}
      <View className="p-1.5" style={dimmed ? { opacity: LOCKED_OPACITY } : undefined}>
        <View className="overflow-hidden rounded-skin-sm">
          {src ? (
            <Image
              source={src}
              style={{ width: '100%', aspectRatio: 1.6 }}
              contentFit="cover"
              transition={150}
              onError={() => setStage((s) => s + 1)}
            />
          ) : (
            <View
              style={{ aspectRatio: 1.6 }}
              className="items-center justify-center bg-bg">
              <Text className="text-4xl">{placeholderEmoji}</Text>
            </View>
          )}
        </View>
      </View>
      <View className="gap-1 px-3 pb-3 pt-1">{children}</View>
    </Pressable>
  );
}
