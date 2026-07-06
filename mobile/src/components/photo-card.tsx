import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { cardShadow } from '@/theme/shadows';

type Props = {
  /** First extracted image URL; a warm placeholder tile is shown when absent. */
  image?: string | null;
  placeholderEmoji?: string;
  onPress?: () => void;
  /** Content rendered below the photo (title, meta, tags…). */
  children: ReactNode;
};

/**
 * Journal photo-forward card: a landscape photo (or warm placeholder) with a
 * "print border" and soft shadow, and a content slot below. Used for Home list
 * cards and the in-list bookmark feed.
 */
export default function PhotoCard({
  image,
  placeholderEmoji = '🔖',
  onPress,
  children,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={cardShadow}
      className="overflow-hidden rounded-skin border-skin border-border bg-panel">
      {/* p-1.5 leaves a panel-colored "print border" around the photo */}
      <View className="p-1.5">
        <View className="overflow-hidden rounded-skin-sm">
          {image ? (
            <Image
              source={image}
              style={{ width: '100%', aspectRatio: 1.6 }}
              contentFit="cover"
              transition={150}
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
