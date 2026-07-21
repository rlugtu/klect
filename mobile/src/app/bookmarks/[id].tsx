import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
import { useHeaderHeight } from '@react-navigation/elements';
import { Ionicons } from '@expo/vector-icons';

import { trpc } from '@/client/api';
import { toast, errorMessage } from '@/client/toast';
import BookmarkVideo from '@/components/bookmark-video';
import CommentsSection, { type CommentItem } from '@/components/comments-section';
import RatingStars from '@/components/rating-stars';
import VisitedPill from '@/components/visited-pill';
import TagPill from '@/components/tag-pill';
import { screenshotThumbUrl, videoPosterUrl } from '@/lib/video-embed';
import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';
import { cardShadow } from '@/theme/shadows';

// Inferred from web's tRPC procedure ({ bookmark, role } | null).
type BookmarkResult = Awaited<ReturnType<typeof trpc.bookmarks.get.query>>;

function mapsUrl(location: string, lat: number | null, lon: number | null) {
  if (lat != null && lon != null)
    return `https://maps.apple.com/?ll=${lat},${lon}&q=${encodeURIComponent(location || 'Location')}`;
  return `https://maps.apple.com/?q=${encodeURIComponent(location)}`;
}

export default function BookmarkScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string; name?: string }>();
  const headerHeight = useHeaderHeight();
  const t = THEME_TOKENS[useTheme().theme];
  const [data, setData] = useState<BookmarkResult>(null);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadComments = useCallback(() => {
    if (!id) return;
    trpc.comments.forBookmark.query({ bookmarkId: id }).then(setComments).catch(() => {});
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      trpc.bookmarks.get
        .query({ bookmarkId: id })
        .then(setData)
        .catch((e) => setError(e instanceof Error ? e.message : 'Request failed'))
        .finally(() => setLoading(false));
      loadComments();
    }, [id, loadComments]),
  );

  const b = data?.bookmark;

  async function toggleVisited() {
    if (!id || !b) return;
    const next = !b.visited;
    setData({ ...data!, bookmark: { ...b, visited: next } }); // optimistic
    try {
      await trpc.bookmarks.toggleVisited.mutate({ bookmarkId: id });
      toast.info(next ? 'Marked as visited' : 'Marked as not visited');
    } catch {
      setData({ ...data!, bookmark: { ...b, visited: b.visited } }); // revert
      toast.error('Could not update');
    }
  }

  async function setRating(rating: number) {
    if (!id || !b) return;
    const prev = b.rating;
    setData({ ...data!, bookmark: { ...b, rating } }); // optimistic
    try {
      await trpc.bookmarks.setRating.mutate({ bookmarkId: id, rating });
    } catch {
      setData({ ...data!, bookmark: { ...b, rating: prev } }); // revert
      toast.error('Could not update rating');
    }
  }

  function confirmDelete() {
    Alert.alert('Delete bookmark?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!id) return;
          try {
            await trpc.bookmarks.delete.mutate({ bookmarkId: id });
            toast.success('Bookmark deleted');
            router.back();
          } catch (e) {
            toast.error(errorMessage(e, 'Could not delete bookmark'));
          }
        },
      },
    ]);
  }

  return (
    <ScrollView
      className="flex-1 bg-bg"
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={{ padding: 16, paddingTop: headerHeight + 8, gap: 12 }}>
      <Stack.Screen
        options={{
          headerTitle: '',
          headerRight: () =>
            b ? (
              <Pressable
                accessibilityLabel="Edit bookmark"
                hitSlop={8}
                onPress={() =>
                  router.push({ pathname: '/bookmarks/edit', params: { id } })
                }
                style={{
                  width: 32,
                  height: 32,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <Ionicons name="create-outline" size={24} color={t.primary} />
              </Pressable>
            ) : null,
        }}
      />

      {loading && <ActivityIndicator />}
      {error && <Text className="font-sans text-danger">{error}</Text>}
      {!loading && !error && !b && (
        <Text className="font-serif-italic text-muted">Bookmark not found.</Text>
      )}

      {b && (
        <>
          {b.videoUrl ? (
            // A playable video replaces the header image; images[0] is its poster.
            <BookmarkVideo
              videoUrl={b.videoUrl}
              videoType={b.videoType}
              poster={
                b.images[0] ??
                videoPosterUrl(b.videoUrl, b.videoType) ??
                screenshotThumbUrl(b.urls[0]) ??
                undefined
              }
            />
          ) : (
            b.images.length > 0 && (
              <View
                style={cardShadow}
                className="overflow-hidden rounded-skin border-skin border-border bg-panel p-1.5">
                <View className="overflow-hidden rounded-skin-sm">
                  <Image
                    source={b.images[0]}
                    style={{ width: '100%', aspectRatio: 1.6 }}
                    contentFit="cover"
                    transition={150}
                  />
                </View>
                {b.images.length > 1 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    className="mt-1.5">
                    <View className="flex-row gap-1.5">
                      {b.images.slice(1).map((src) => (
                        <View key={src} className="overflow-hidden rounded-skin-sm">
                          <Image
                            source={src}
                            style={{ width: 84, height: 60 }}
                            contentFit="cover"
                          />
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                )}
              </View>
            )
          )}

          <Text className="font-serif text-3xl text-ink">{b.name}</Text>

          {/* Instagram-style action row — sits above the rating/visited row. */}
          <View className="flex-row items-center gap-4 border-b border-border pb-3">
            <Pressable
              accessibilityLabel="Send to a friend"
              hitSlop={8}
              onPress={() =>
                router.push({
                  pathname: '/bookmarks/share',
                  params: { id, name: b.name },
                })
              }>
              <Ionicons name="paper-plane-outline" size={24} color={t.ink} />
            </Pressable>
          </View>

          <View className="flex-row items-center justify-between">
            <RatingStars value={b.rating} onChange={setRating} />
            <VisitedPill visited={b.visited} onToggle={toggleVisited} size="md" />
          </View>

          {b.tags.length > 0 && (
            <View className="flex-row flex-wrap gap-1">
              {b.tags.map((bt) => (
                <TagPill key={bt.tag.id} name={bt.tag.name} color={bt.tag.color} />
              ))}
            </View>
          )}

          {b.description ? (
            <Text className="font-sans text-base text-ink">{b.description}</Text>
          ) : null}

          {b.urls.length > 0 && (
            <View className="gap-1">
              {b.urls.map((url) => (
                <Pressable key={url} onPress={() => Linking.openURL(url)}>
                  <Text className="font-sans text-primary" numberOfLines={1}>
                    {url}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          {b.location ? (
            <Pressable
              onPress={() =>
                Linking.openURL(mapsUrl(b.location, b.latitude, b.longitude))
              }>
              <Text className="font-sans text-primary">📍 {b.location}</Text>
            </Pressable>
          ) : null}

          {b.notes ? (
            <View className="rounded-skin border-skin border-border bg-panel p-3">
              <Text className="font-sans text-sm text-muted">{b.notes}</Text>
            </View>
          ) : null}

          <CommentsSection
            comments={comments}
            onAdd={async (value) => {
              if (!id) return;
              await trpc.comments.addToBookmark.mutate({ bookmarkId: id, value });
              toast.success('Comment posted');
              loadComments();
            }}
            onDelete={async (commentId) => {
              await trpc.comments.delete.mutate({ commentId });
              loadComments();
            }}
          />

          <Pressable
            className="mt-4 items-center rounded-skin border-skin border-border py-3"
            onPress={confirmDelete}>
            <Text className="font-sans-semibold text-danger">Delete bookmark</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}
