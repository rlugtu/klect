import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';

import { trpc } from '@/client/api';
import CommentsSection, { type CommentItem } from '@/components/comments-section';

// Inferred from web's tRPC procedure.
type Bookmarks = Awaited<ReturnType<typeof trpc.bookmarks.forList.query>>;

export default function ListScreen() {
  const router = useRouter();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const [bookmarks, setBookmarks] = useState<Bookmarks>([]);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadComments = useCallback(() => {
    if (!id) return;
    trpc.comments.forList.query({ listId: id }).then(setComments).catch(() => {});
  }, [id]);

  // Distinct tags present across the list's bookmarks (for the filter chips).
  const availableTags = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color: string }>();
    for (const b of bookmarks) for (const bt of b.tags) map.set(bt.tag.id, bt.tag);
    return [...map.values()];
  }, [bookmarks]);

  // OR filter — a bookmark shows if it has any selected tag.
  const shown = useMemo(() => {
    if (selected.size === 0) return bookmarks;
    return bookmarks.filter((b) => b.tags.some((bt) => selected.has(bt.tag.id)));
  }, [bookmarks, selected]);

  function toggleTag(tagId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  }

  // Refetch on focus so a newly-created bookmark shows on return.
  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      setLoading(true);
      trpc.bookmarks.forList
        .query({ listId: id })
        .then(setBookmarks)
        .catch((e) => setError(e instanceof Error ? e.message : 'Request failed'))
        .finally(() => setLoading(false));
      loadComments();
    }, [id, loadComments]),
  );

  function confirmDeleteList() {
    Alert.alert('Delete list?', 'This deletes the list and its bookmarks.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!id) return;
          await trpc.lists.delete.mutate({ listId: id });
          router.back();
        },
      },
    ]);
  }

  return (
    <View className="flex-1 bg-bg px-4 pt-4">
      <Stack.Screen
        options={{
          title: name ?? 'List',
          headerRight: () => (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/bookmarks/new',
                  params: { listId: id, listName: name },
                })
              }>
              <Text className="text-base font-semibold text-primary">Add</Text>
            </Pressable>
          ),
        }}
      />

      {loading && <Text className="text-muted">Loading…</Text>}
      {error && <Text className="text-danger">{error}</Text>}
      {!loading && !error && bookmarks.length === 0 && (
        <Text className="text-muted">No bookmarks yet.</Text>
      )}

      {availableTags.length > 0 && (
        <View className="mb-2 flex-row flex-wrap gap-1">
          {availableTags.map((t) => {
            const on = selected.has(t.id);
            return (
              <Pressable
                key={t.id}
                onPress={() => toggleTag(t.id)}
                style={{ backgroundColor: t.color, opacity: !on && selected.size > 0 ? 0.4 : 1 }}
                className="rounded-full px-3 py-1">
                <Text className="text-xs text-ink">
                  {on ? '✓ ' : ''}
                  {t.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <FlatList
        data={shown}
        keyExtractor={(b) => b.id}
        contentContainerStyle={{ gap: 8, paddingBottom: 24 }}
        ListFooterComponent={
          <View className="mt-6 gap-3">
            <CommentsSection
              comments={comments}
              onAdd={async (value) => {
                if (!id) return;
                await trpc.comments.addToList.mutate({ listId: id, value });
                loadComments();
              }}
              onDelete={async (commentId) => {
                await trpc.comments.delete.mutate({ commentId });
                loadComments();
              }}
            />
            <Pressable
              onPress={() =>
                router.push({ pathname: '/lists/members', params: { id, name } })
              }
              className="items-center rounded-lg border border-border py-3">
              <Text className="text-ink">Members &amp; sharing</Text>
            </Pressable>
            <Pressable
              onPress={() =>
                router.push({ pathname: '/lists/edit', params: { id } })
              }
              className="items-center rounded-lg border border-border py-3">
              <Text className="text-ink">Edit list</Text>
            </Pressable>
            <Pressable
              onPress={confirmDeleteList}
              className="items-center rounded-lg border border-border py-3">
              <Text className="font-semibold text-danger">Delete list</Text>
            </Pressable>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/bookmarks/[id]',
                params: { id: item.id, name: item.name },
              })
            }
            className="gap-1 rounded-xl border border-border bg-panel p-3">
            <Text className="text-base font-semibold text-ink">{item.name}</Text>
            {item.description ? (
              <Text className="text-sm text-muted" numberOfLines={2}>
                {item.description}
              </Text>
            ) : null}
            {item.tags.length > 0 && (
              <View className="mt-1 flex-row flex-wrap gap-1">
                {item.tags.map((bt) => (
                  <View
                    key={bt.tag.id}
                    className="rounded px-2 py-0.5"
                    style={{ backgroundColor: bt.tag.color }}>
                    <Text className="text-xs text-ink">{bt.tag.name}</Text>
                  </View>
                ))}
              </View>
            )}
          </Pressable>
        )}
      />
    </View>
  );
}
