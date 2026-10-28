import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useHeaderHeight } from '@react-navigation/elements';

import { trpc } from '@/client/api';
import LockedBadge, { LOCKED_OPACITY } from '@/components/locked-badge';
import PhotoCard from '@/components/photo-card';
import { ListChip } from '@/components/recent-bookmarks-strip';
import Skeleton from '@/components/skeleton';
import { videoPosterUrl } from '@/lib/video-embed';

// Inferred straight from web's tRPC procedure. No hand-written DTOs.
type RecentPage = Awaited<ReturnType<typeof trpc.bookmarks.recent.query>>;
type RecentBookmarks = RecentPage['items'];

/**
 * "Recent bookmarks": the whole cross-list newest-first feed behind Home's "Recently saved"
 * strip, paged by cursor as the user scrolls.
 *
 * Same shell as the list-detail screen (titleless header, the page name in the scrolling
 * content, content padded by the header height so it scrolls under the frosted bar) and the same
 * `PhotoCard` rows, plus a chip per row saying which list each bookmark came from, since this
 * feed crosses lists.
 */
export default function RecentBookmarksScreen() {
  const router = useRouter();
  const headerHeight = useHeaderHeight();

  const [items, setItems] = useState<RecentBookmarks>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // `onEndReached` can fire again before a setState lands, so the guard has to be synchronous.
  // Same shape as `loadOlder`'s guard on the DM thread.
  const fetching = useRef(false);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      trpc.bookmarks.recent
        .query({})
        .then((page) => {
          setItems(page.items);
          setNextCursor(page.nextCursor);
          setError(null);
        })
        .catch((e) => setError(e instanceof Error ? e.message : 'Request failed'))
        .finally(() => setLoading(false));
    }, []),
  );

  async function loadMore() {
    if (!nextCursor || fetching.current) return;
    fetching.current = true;
    setLoadingMore(true);
    try {
      const page = await trpc.bookmarks.recent.query({ cursor: nextCursor });
      setItems((cur) => {
        // A bookmark saved while the user was scrolling shifts the whole window, so the next
        // page can repeat a row we already have. Keyed de-dupe keeps the FlatList keys unique.
        const seen = new Set(cur.map((b) => b.id));
        return [...cur, ...page.items.filter((b) => !seen.has(b.id))];
      });
      setNextCursor(page.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      fetching.current = false;
      setLoadingMore(false);
    }
  }

  return (
    <View className="flex-1 bg-bg">
      <Stack.Screen options={{ headerTitle: '' }} />

      <FlatList
        data={items}
        keyExtractor={(b) => b.id}
        contentContainerStyle={{
          padding: 16,
          paddingTop: headerHeight + 8,
          paddingBottom: 24,
          gap: 16,
        }}
        onEndReachedThreshold={0.5}
        onEndReached={loadMore}
        ListHeaderComponent={
          <View className="gap-3 pb-1">
            <Text className="font-serif text-3xl text-ink">Recent bookmarks</Text>
            {loading && (
              // Photo-card-shaped placeholders, same idiom as the list screen.
              <View className="gap-4">
                <Skeleton height={180} />
                <Skeleton height={180} />
              </View>
            )}
            {error && <Text className="font-sans text-danger">{error}</Text>}
            {!loading && !error && items.length === 0 && (
              <Text className="font-serif-italic text-muted">
                Nothing saved yet. Bookmarks you add to any list show up here.
              </Text>
            )}
          </View>
        }
        ListFooterComponent={
          loadingMore ? (
            <View className="py-4">
              <ActivityIndicator />
            </View>
          ) : null
        }
        renderItem={({ item: b }) => {
          // Read-only when the bookmark itself is locked or its list is: a cross-list row has to
          // check both, exactly as the in-list feed does, because the server refuses either way.
          const locked = b.lockedAt != null || b.list.lockedAt != null;
          const dim = locked ? { opacity: LOCKED_OPACITY } : undefined;
          return (
            <PhotoCard
              // Never the video itself, always a static thumbnail: extracted image first, then a
              // derived video poster, then the placeholder.
              image={b.images[0] ?? null}
              fallbackImage={videoPosterUrl(b.videoUrl, b.videoType)}
              dimmed={locked}
              onPress={() =>
                router.push({
                  pathname: '/bookmarks/[id]',
                  params: { id: b.id, name: b.name },
                })
              }>
              <View className="flex-row items-center gap-2">
                <Text className="flex-shrink font-serif text-lg text-ink" style={dim}>
                  {b.name}
                </Text>
                {locked && <LockedBadge />}
              </View>
              {b.description ? (
                <Text className="font-sans text-sm text-muted" style={dim} numberOfLines={2}>
                  {b.description}
                </Text>
              ) : null}
              {/* The one thing an in-list card doesn't need: which list this came from. */}
              <View className="mt-1 flex-row" style={dim}>
                <ListChip icon={b.list.icon} name={b.list.name} />
              </View>
            </PhotoCard>
          );
        }}
      />
    </View>
  );
}
