import { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import type { trpc } from '@/client/api';
import Skeleton from '@/components/skeleton';
import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';

// Inferred straight from web's tRPC procedure, same as every other screen. No hand-written DTOs.
type RecentPage = Awaited<ReturnType<typeof trpc.bookmarks.recent.query>>;
export type RecentBookmarks = RecentPage['items'];
type RecentBookmark = RecentBookmarks[number];

/** Square side of one card's photo, and the gap between cards. */
const CARD = 84;
const CARD_GAP = 8;
/** One line of name under the photo. No second line is reserved, as on the Home tiles. */
const NAME_LINE_HEIGHT = 14;

/**
 * Which list a bookmark lives in, as a compact pill: the list's emoji plus its name on one line.
 * Panel fill + ink text so it stays legible over a photo in every theme, the same way the
 * bookmark-count pill on a Home tile does. Shared with the Recent bookmarks page, which is the
 * same cross-list feed at full width.
 */
export function ListChip({ icon, name }: { icon: string; name: string }) {
  return (
    <View className="shrink flex-row items-center gap-1 rounded-full border-skin border-border bg-panel px-1.5 py-px">
      <Text className="text-[10px]">{icon}</Text>
      <Text className="shrink font-sans-medium text-[10px] text-ink" numberOfLines={1}>
        {name}
      </Text>
    </View>
  );
}

/**
 * One square card: the bookmark's first extracted photo with its list's chip on the photo's
 * bottom edge, and the bookmark's name on one line below. No photo (or a photo that fails to
 * load, since hotlinks break) falls back to the owning list's emoji on the theme backdrop, the
 * same fallback the Home tile covers use.
 */
function RecentCard({ bookmark, onPress }: { bookmark: RecentBookmark; onPress: () => void }) {
  const src = bookmark.images[0] ?? null;
  const [failed, setFailed] = useState(false);
  // FlatList recycles card instances, so a new photo has to start from a clean slate.
  useEffect(() => setFailed(false), [src]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${bookmark.name}, in ${bookmark.list.name}`}
      onPress={onPress}
      style={{ width: CARD }}>
      <View className="overflow-hidden rounded-skin border-skin border-border bg-panel">
        {src && !failed ? (
          <Image
            source={src}
            style={{ width: CARD, height: CARD }}
            contentFit="cover"
            transition={150}
            accessible={false}
            onError={() => setFailed(true)}
          />
        ) : (
          <View style={{ width: CARD, height: CARD }} className="items-center justify-center bg-bg">
            <Text className="text-2xl">{bookmark.list.icon}</Text>
          </View>
        )}
        {/* Inset on both sides so a long list name truncates inside the photo instead of
            wrapping and growing the card. */}
        <View className="absolute bottom-1 left-1 right-1 flex-row">
          <ListChip icon={bookmark.list.icon} name={bookmark.list.name} />
        </View>
      </View>
      <Text
        className="pt-1 font-sans text-[11px] text-ink"
        numberOfLines={1}
        style={{ lineHeight: NAME_LINE_HEIGHT }}>
        {bookmark.name}
      </Text>
    </Pressable>
  );
}

/**
 * Home's "Recently saved" strip: the newest bookmarks across every list the user can see, as a
 * compact horizontal row above the list search.
 *
 * Purely presentational, the same relationship to Home that `ListTile` has: Home owns the fetch
 * (on the same refetch-on-focus lifecycle as its lists) and passes the page down.
 *
 * Renders nothing at all once loaded with no items — no header, no empty row. A user with nothing
 * saved yet should see Home's attention on "your lists", not a strip apologizing for itself.
 */
export default function RecentBookmarksStrip({
  items,
  loading,
}: {
  items: RecentBookmarks;
  loading: boolean;
}) {
  const router = useRouter();
  const t = THEME_TOKENS[useTheme().theme];

  if (!loading && items.length === 0) return null;

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Text className="font-serif text-lg text-ink">Recently saved</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View all recent bookmarks"
          onPress={() => router.push('/bookmarks/recent')}
          className="flex-row items-center gap-0.5"
          hitSlop={8}>
          <Text className="font-sans-medium text-sm text-primary">View all</Text>
          <Ionicons name="chevron-forward" size={14} color={t.primary} />
        </Pressable>
      </View>

      {loading && items.length === 0 ? (
        // Card-shaped placeholders in the strip's own geometry, same idiom as Home's tile grid.
        <View className="flex-row" style={{ gap: CARD_GAP }}>
          {Array.from({ length: 5 }, (_, i) => (
            <View key={i} style={{ width: CARD }}>
              <Skeleton height={CARD} />
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          horizontal
          data={items}
          keyExtractor={(b) => b.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: CARD_GAP }}
          renderItem={({ item }) => (
            <RecentCard
              bookmark={item}
              onPress={() =>
                router.push({
                  pathname: '/bookmarks/[id]',
                  params: { id: item.id, name: item.name },
                })
              }
            />
          )}
        />
      )}
    </View>
  );
}
