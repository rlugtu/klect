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

import { trpc } from '@/client/api';
import CommentsSection, { type CommentItem } from '@/components/comments-section';

// Inferred from web's tRPC procedure ({ bookmark, role } | null).
type BookmarkResult = Awaited<ReturnType<typeof trpc.bookmarks.get.query>>;

function stars(rating: number) {
  return '★'.repeat(rating) + '☆'.repeat(Math.max(0, 5 - rating));
}

function mapsUrl(location: string, lat: number | null, lon: number | null) {
  if (lat != null && lon != null)
    return `https://maps.apple.com/?ll=${lat},${lon}&q=${encodeURIComponent(location || 'Location')}`;
  return `https://maps.apple.com/?q=${encodeURIComponent(location)}`;
}

export default function BookmarkScreen() {
  const router = useRouter();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const [data, setData] = useState<BookmarkResult>(null);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadComments = useCallback(() => {
    if (!id) return;
    trpc.comments.forBookmark.query({ bookmarkId: id }).then(setComments).catch(() => {});
  }, [id]);

  // Refetch on focus so returning from Edit shows updated values.
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
    setData({ ...data!, bookmark: { ...b, visited: !b.visited } }); // optimistic
    try {
      await trpc.bookmarks.toggleVisited.mutate({ bookmarkId: id });
    } catch {
      setData({ ...data!, bookmark: { ...b, visited: b.visited } }); // revert
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
          await trpc.bookmarks.delete.mutate({ bookmarkId: id });
          router.back();
        },
      },
    ]);
  }

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Stack.Screen
        options={{
          title: name ?? b?.name ?? 'Bookmark',
          headerRight: () =>
            b ? (
              <Pressable
                onPress={() =>
                  router.push({ pathname: '/bookmarks/edit', params: { id } })
                }>
                <Text className="text-base font-semibold text-primary">Edit</Text>
              </Pressable>
            ) : null,
        }}
      />

      {loading && <ActivityIndicator />}
      {error && <Text className="text-danger">{error}</Text>}
      {!loading && !error && !b && (
        <Text className="text-muted">Bookmark not found.</Text>
      )}

      {b && (
        <>
          {b.images.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-2">
                {b.images.map((src) => (
                  <Image
                    key={src}
                    source={src}
                    style={{ width: 220, height: 160, borderRadius: 12 }}
                    contentFit="cover"
                  />
                ))}
              </View>
            </ScrollView>
          )}

          <Text className="text-2xl font-bold text-ink">{b.name}</Text>

          <View className="flex-row items-center gap-3">
            {b.rating > 0 && <Text className="text-warning">{stars(b.rating)}</Text>}
            <Pressable
              onPress={toggleVisited}
              className={`rounded px-2 py-0.5 ${b.visited ? 'bg-success' : 'border border-border'}`}>
              <Text className={`text-xs ${b.visited ? 'text-primary-ink' : 'text-muted'}`}>
                {b.visited ? 'Visited' : 'Mark visited'}
              </Text>
            </Pressable>
          </View>

          {b.tags.length > 0 && (
            <View className="flex-row flex-wrap gap-1">
              {b.tags.map((bt) => (
                <View
                  key={bt.tag.id}
                  className="rounded px-2 py-0.5"
                  style={{ backgroundColor: bt.tag.color }}>
                  <Text className="text-xs text-ink">{bt.tag.name}</Text>
                </View>
              ))}
            </View>
          )}

          {b.description ? (
            <Text className="text-base text-ink">{b.description}</Text>
          ) : null}

          {b.urls.length > 0 && (
            <View className="gap-1">
              {b.urls.map((url) => (
                <Pressable key={url} onPress={() => Linking.openURL(url)}>
                  <Text className="text-primary" numberOfLines={1}>
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
              <Text className="text-primary">📍 {b.location}</Text>
            </Pressable>
          ) : null}

          {b.notes ? (
            <View className="rounded-xl border border-border bg-panel p-3">
              <Text className="text-sm text-muted">{b.notes}</Text>
            </View>
          ) : null}

          <CommentsSection
            comments={comments}
            onAdd={async (value) => {
              if (!id) return;
              await trpc.comments.addToBookmark.mutate({ bookmarkId: id, value });
              loadComments();
            }}
            onDelete={async (commentId) => {
              await trpc.comments.delete.mutate({ commentId });
              loadComments();
            }}
          />

          <Pressable
            className="mt-4 items-center rounded-lg border border-border py-3"
            onPress={confirmDelete}>
            <Text className="font-semibold text-danger">Delete bookmark</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}
