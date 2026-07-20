import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { trpc } from '@/client/api';
import { toast } from '@/client/toast';
import BookmarkForm, { type BookmarkData } from '@/components/bookmark-form';

/** Edit an existing bookmark: fetch it, prefill the form, then update. */
export default function EditBookmarkScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [initial, setInitial] = useState<BookmarkData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    trpc.bookmarks.get
      .query({ bookmarkId: id })
      .then((res) => {
        if (!res) {
          setError('Bookmark not found');
          return;
        }
        const b = res.bookmark;
        setInitial({
          name: b.name,
          description: b.description,
          urls: b.urls,
          images: b.images,
          notes: b.notes,
          location: b.location,
          latitude: b.latitude,
          longitude: b.longitude,
          rating: b.rating,
          visited: b.visited,
          videoUrl: b.videoUrl,
          videoType: b.videoType,
          tagNames: b.tags.map((t) => t.tag.name),
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Request failed'));
  }, [id]);

  if (error) {
    return (
      <View className="flex-1 bg-bg p-4">
        <Text className="text-danger">{error}</Text>
      </View>
    );
  }

  if (!initial) {
    return (
      <View className="flex-1 items-center justify-center bg-bg">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <BookmarkForm
      initial={initial}
      submitLabel="Save changes"
      onSubmit={async (data) => {
        if (!id) return;
        await trpc.bookmarks.update.mutate({ bookmarkId: id, data });
        toast.success('Bookmark updated');
        router.back();
      }}
    />
  );
}
