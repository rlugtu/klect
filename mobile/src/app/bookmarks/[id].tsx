import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';

import { trpc } from '@/client/api';

// Inferred from web's tRPC procedure ({ bookmark, role } | null).
type BookmarkResult = Awaited<ReturnType<typeof trpc.bookmarks.get.query>>;

function stars(rating: number) {
  return '★'.repeat(rating) + '☆'.repeat(Math.max(0, 5 - rating));
}

function mapsUrl(location: string, lat: number | null, lon: number | null) {
  if (lat != null && lon != null) return `https://maps.apple.com/?ll=${lat},${lon}&q=${encodeURIComponent(location || 'Location')}`;
  return `https://maps.apple.com/?q=${encodeURIComponent(location)}`;
}

export default function BookmarkScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const [data, setData] = useState<BookmarkResult>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    trpc.bookmarks.get
      .query({ bookmarkId: id })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Request failed'))
      .finally(() => setLoading(false));
  }, [id]);

  const b = data?.bookmark;

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Stack.Screen options={{ title: name ?? b?.name ?? 'Bookmark' }} />

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
            {b.rating > 0 && (
              <Text className="text-warning">{stars(b.rating)}</Text>
            )}
            {b.visited && (
              <View className="rounded bg-success px-2 py-0.5">
                <Text className="text-xs text-primary-ink">Visited</Text>
              </View>
            )}
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
        </>
      )}
    </ScrollView>
  );
}
