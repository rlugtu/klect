import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
import { BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';

import { trpc } from '@/client/api';
import CommentsSection, { type CommentItem } from '@/components/comments-section';
import PhotoCard from '@/components/photo-card';
import TagPill from '@/components/tag-pill';
import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';

// Inferred from web's tRPC procedure.
type Bookmarks = Awaited<ReturnType<typeof trpc.bookmarks.forList.query>>;

export default function ListScreen() {
  const router = useRouter();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const t = THEME_TOKENS[useTheme().theme];
  const sheetRef = useRef<BottomSheetModal>(null);

  const [bookmarks, setBookmarks] = useState<Bookmarks>([]);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadComments = useCallback(() => {
    if (!id) return;
    trpc.comments.forList.query({ listId: id }).then(setComments).catch(() => {});
  }, [id]);

  // Distinct tags present across the list's bookmarks (for the filter sheet).
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

  const selectedTags = availableTags.filter((tag) => selected.has(tag.id));

  return (
    <View className="flex-1 bg-bg">
      <Stack.Screen
        options={{
          title: name ?? 'List',
          headerRight: () => (
            <View className="flex-row items-center gap-4">
              {availableTags.length > 0 && (
                <Pressable onPress={() => sheetRef.current?.present()}>
                  <Text className="font-sans-semibold text-base text-primary">
                    Tags ▾
                  </Text>
                </Pressable>
              )}
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/bookmarks/new',
                    params: { listId: id, listName: name },
                  })
                }>
                <Text className="font-sans-semibold text-base text-primary">Add</Text>
              </Pressable>
            </View>
          ),
        }}
      />

      <FlatList
        data={shown}
        keyExtractor={(b) => b.id}
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 24 }}
        ListHeaderComponent={
          <View className="gap-3 pb-1">
            <View className="flex-row gap-2">
              <Pressable
                onPress={() => router.push({ pathname: '/lists/edit', params: { id } })}
                className="flex-1 items-center rounded-skin border-skin border-border py-3">
                <Text className="font-sans text-ink">Edit list</Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  router.push({ pathname: '/lists/members', params: { id, name } })
                }
                className="flex-1 items-center rounded-skin border-skin border-border py-3">
                <Text className="font-sans text-ink">Members</Text>
              </Pressable>
            </View>

            {selectedTags.length > 0 && (
              <View className="flex-row flex-wrap items-center gap-1">
                {selectedTags.map((tag) => (
                  <Pressable
                    key={tag.id}
                    onPress={() => toggleTag(tag.id)}
                    style={{ backgroundColor: tag.color }}
                    className="rounded-skin-sm px-2.5 py-0.5">
                    <Text className="font-sans text-xs text-ink">
                      {tag.name.toLowerCase()} ✕
                    </Text>
                  </Pressable>
                ))}
                <Pressable onPress={() => setSelected(new Set())} className="px-1">
                  <Text className="font-sans text-xs text-muted">Clear all</Text>
                </Pressable>
              </View>
            )}

            {loading && <Text className="font-sans text-muted">Loading…</Text>}
            {error && <Text className="font-sans text-danger">{error}</Text>}
            {!loading && !error && bookmarks.length === 0 && (
              <Text className="font-serif-italic text-muted">
                No bookmarks yet — add your first find.
              </Text>
            )}
          </View>
        }
        ListFooterComponent={
          <View className="mt-6">
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
          </View>
        }
        renderItem={({ item }) => (
          <PhotoCard
            image={item.images[0] ?? null}
            onPress={() =>
              router.push({
                pathname: '/bookmarks/[id]',
                params: { id: item.id, name: item.name },
              })
            }>
            <Text className="font-serif text-lg text-ink">{item.name}</Text>
            {item.description ? (
              <Text className="font-sans text-sm text-muted" numberOfLines={2}>
                {item.description}
              </Text>
            ) : null}
            <View className="mt-1 flex-row flex-wrap items-center gap-1">
              {item.rating > 0 && (
                <Text className="mr-1 text-sm text-accent">
                  {'★'.repeat(item.rating)}
                </Text>
              )}
              {item.tags.map((bt) => (
                <TagPill key={bt.tag.id} name={bt.tag.name} color={bt.tag.color} />
              ))}
            </View>
          </PhotoCard>
        )}
      />

      <BottomSheetModal
        ref={sheetRef}
        backgroundStyle={{ backgroundColor: t.panel }}
        handleIndicatorStyle={{ backgroundColor: t.muted }}>
        <BottomSheetView style={{ paddingHorizontal: 16, paddingBottom: 32 }}>
          <Text className="mb-1 font-serif text-lg text-ink">Filter by tag</Text>
          {availableTags.map((tag) => {
            const on = selected.has(tag.id);
            return (
              <Pressable
                key={tag.id}
                onPress={() => toggleTag(tag.id)}
                className="flex-row items-center justify-between border-b border-border py-3">
                <View className="flex-row items-center gap-2">
                  <View
                    style={{ backgroundColor: tag.color }}
                    className="h-4 w-4 rounded-full"
                  />
                  <Text className="font-sans text-ink">{tag.name.toLowerCase()}</Text>
                </View>
                {on && <Text className="text-base text-primary">✓</Text>}
              </Pressable>
            );
          })}
        </BottomSheetView>
      </BottomSheetModal>
    </View>
  );
}
