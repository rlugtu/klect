import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
import { BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { useHeaderHeight } from '@react-navigation/elements';
import { Ionicons } from '@expo/vector-icons';

import { trpc } from '@/client/api';
import CommentsSection, { type CommentItem } from '@/components/comments-section';
import PhotoCard from '@/components/photo-card';
import TagPill from '@/components/tag-pill';
import { screenshotThumbUrl, videoPosterUrl } from '@/lib/video-embed';
import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';

// Inferred from web's tRPC procedures.
type Bookmarks = Awaited<ReturnType<typeof trpc.bookmarks.forList.query>>;
type ListAccess = Awaited<ReturnType<typeof trpc.lists.get.query>>;

export default function ListScreen() {
  const router = useRouter();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const t = THEME_TOKENS[useTheme().theme];
  const headerHeight = useHeaderHeight();
  const sheetRef = useRef<BottomSheetModal>(null);
  const actionsSheetRef = useRef<BottomSheetModal>(null);

  const [bookmarks, setBookmarks] = useState<Bookmarks>([]);
  const [access, setAccess] = useState<ListAccess>(null);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  // Off by default → all bookmarks; on → only those the user hasn't visited.
  const [hideVisited, setHideVisited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadComments = useCallback(() => {
    if (!id) return;
    trpc.comments.forList.query({ listId: id }).then(setComments).catch(() => {});
  }, [id]);

  const loadBookmarks = useCallback(() => {
    if (!id) return;
    setLoading(true);
    trpc.bookmarks.forList
      .query({ listId: id })
      .then(setBookmarks)
      .catch((e) => setError(e instanceof Error ? e.message : 'Request failed'))
      .finally(() => setLoading(false));
  }, [id]);

  // Distinct tags present across the list's bookmarks (for the filter sheet).
  const availableTags = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color: string }>();
    for (const b of bookmarks) for (const bt of b.tags) map.set(bt.tag.id, bt.tag);
    return [...map.values()];
  }, [bookmarks]);

  // Name search (substring) AND tag filter (OR across selected tags) AND
  // an optional "show only unvisited" filter, all applied together.
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bookmarks.filter(
      (b) =>
        (q === '' || b.name.toLowerCase().includes(q)) &&
        (selected.size === 0 || b.tags.some((bt) => selected.has(bt.tag.id))) &&
        (!hideVisited || !b.visited),
    );
  }, [bookmarks, selected, query, hideVisited]);

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
      loadBookmarks();
      trpc.lists.get
        .query({ listId: id })
        .then(setAccess)
        .catch(() => {});
      loadComments();
    }, [id, loadBookmarks, loadComments]),
  );

  function confirmClear() {
    if (!id) return;
    Alert.alert(
      'Clear all bookmarks?',
      'This deletes every bookmark in this list. The list itself stays. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear all',
          style: 'destructive',
          onPress: async () => {
            try {
              await trpc.lists.clearBookmarks.mutate({ listId: id });
              loadBookmarks();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Clear failed');
            }
          },
        },
      ],
    );
  }

  const selectedTags = availableTags.filter((tag) => selected.has(tag.id));

  const description = access?.list.description ?? '';
  const isMember = access?.isMember ?? false;
  const isOwner = isMember && access?.role === 'OWNER';
  const canEdit =
    isMember && (access?.role === 'OWNER' || access?.role === 'COLLABORATOR');

  return (
    <View className="flex-1 bg-bg">
      <Stack.Screen
        options={{
          headerTitle: '',
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {canEdit && (
                <Pressable
                  accessibilityLabel="Add bookmark"
                  hitSlop={8}
                  onPress={() =>
                    router.push({
                      pathname: '/bookmarks/new',
                      params: { listId: id, listName: name },
                    })
                  }
                  style={{
                    width: 32,
                    height: 32,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  {/* Nudge right to counter the Ionicons "add" glyph's left side-bearing. */}
                  <Ionicons
                    name="add"
                    size={28}
                    color={t.primary}
                    style={{ marginLeft: 1 }}
                  />
                </Pressable>
              )}
              {isMember && (
                <Pressable
                  accessibilityLabel="List actions"
                  hitSlop={8}
                  onPress={() => actionsSheetRef.current?.present()}
                  style={{
                    width: 32,
                    height: 32,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <Ionicons name="ellipsis-vertical" size={20} color={t.ink} />
                </Pressable>
              )}
            </View>
          ),
        }}
      />

      <FlatList
        data={shown}
        keyExtractor={(b) => b.id}
        contentContainerStyle={{
          padding: 16,
          paddingTop: headerHeight + 8,
          gap: 16,
          paddingBottom: 24,
        }}
        ListHeaderComponent={
          <View className="gap-3 pb-1">
            <Text className="font-serif text-3xl text-ink">{name ?? 'List'}</Text>

            {description.trim() !== '' && (
              <Text className="font-sans text-muted">{description}</Text>
            )}

            {!isMember && (
              <View className="flex-row items-center gap-1.5 rounded-skin border-skin border-border px-3 py-2">
                <Ionicons name="globe-outline" size={14} color={t.muted} />
                <Text className="font-sans text-sm text-muted">
                  Public list · view only
                </Text>
              </View>
            )}

            <View className="flex-row items-center justify-between">
              <Text className="font-sans text-ink">Show only unvisited</Text>
              <Switch
                value={hideVisited}
                onValueChange={setHideVisited}
                trackColor={{ true: t.primary, false: `${t.muted}66` }}
                ios_backgroundColor={`${t.muted}66`}
              />
            </View>

            {isMember && (
              <View className="flex-row border-b border-border">
                <View className="flex-row items-center gap-1.5 border-b-2 border-primary px-1 pb-2">
                  <Ionicons name="list" size={16} color={t.primary} />
                  <Text className="font-sans-semibold text-primary">List</Text>
                </View>
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: '/polls',
                      params: { listId: id, listName: name },
                    })
                  }
                  className="ml-4 flex-row items-center gap-1.5 border-b-2 border-transparent px-1 pb-2">
                  <Ionicons name="bar-chart" size={16} color={t.muted} />
                  <Text className="font-sans text-muted">Polls</Text>
                </Pressable>
              </View>
            )}

            <View className="flex-row items-center gap-2">
              <TextInput
                className="flex-1 rounded-skin border-skin border-border px-4 py-2.5 font-sans text-ink"
                placeholder="Search bookmarks"
                placeholderTextColor={t.muted}
                autoCapitalize="none"
                autoCorrect={false}
                value={query}
                onChangeText={setQuery}
              />
              {availableTags.length > 0 && (
                <Pressable
                  onPress={() => sheetRef.current?.present()}
                  className="rounded-skin border-skin border-border px-3 py-2.5">
                  <Text className="font-sans-semibold text-ink">Tags ▾</Text>
                </Pressable>
              )}
            </View>

            {(selectedTags.length > 0 || query.trim() !== '') && (
              <View className="flex-row flex-wrap items-center gap-1">
                {selectedTags.map((tag) => (
                  <Pressable
                    key={tag.id}
                    onPress={() => toggleTag(tag.id)}
                    className="px-1 py-0.5">
                    <Text className="font-sans text-sm text-muted">
                      #{tag.name.toLowerCase()} ✕
                    </Text>
                  </Pressable>
                ))}
                <Pressable
                  onPress={() => {
                    setSelected(new Set());
                    setQuery('');
                  }}
                  className="px-1">
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
              readOnly={!isMember}
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
            // Never the video itself — always a static thumbnail. If the
            // extracted image is missing or fails (e.g. a hotlink-blocked reel
            // og:image), fall back to a YouTube poster or a page screenshot.
            image={item.images[0] ?? null}
            fallbackImage={
              videoPosterUrl(item.videoUrl, item.videoType) ??
              screenshotThumbUrl(item.urls[0])
            }
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
                <Text className="font-sans text-ink">
                  #{tag.name.toLowerCase()}
                </Text>
                {on && <Text className="text-base text-primary">✓</Text>}
              </Pressable>
            );
          })}
        </BottomSheetView>
      </BottomSheetModal>

      <BottomSheetModal
        ref={actionsSheetRef}
        backgroundStyle={{ backgroundColor: t.panel }}
        handleIndicatorStyle={{ backgroundColor: t.muted }}>
        <BottomSheetView style={{ paddingHorizontal: 16, paddingBottom: 32 }}>
          {canEdit && (
            <Pressable
              onPress={() => {
                actionsSheetRef.current?.dismiss();
                router.push({ pathname: '/lists/edit', params: { id } });
              }}
              className="flex-row items-center gap-3 border-b border-border py-3.5">
              <Ionicons name="create-outline" size={20} color={t.ink} />
              <Text className="font-sans text-ink">Edit list</Text>
            </Pressable>
          )}
          {isOwner && (
            <Pressable
              onPress={() => {
                actionsSheetRef.current?.dismiss();
                router.push({ pathname: '/lists/members', params: { id, name } });
              }}
              className="flex-row items-center gap-3 border-b border-border py-3.5">
              <Ionicons name="people-outline" size={20} color={t.ink} />
              <Text className="font-sans text-ink">Members</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => {
              actionsSheetRef.current?.dismiss();
              router.push({ pathname: '/lists/actions', params: { id, name } });
            }}
            className="flex-row items-center gap-3 border-b border-border py-3.5">
            <Ionicons name="copy-outline" size={20} color={t.ink} />
            <Text className="font-sans text-ink">Duplicate list</Text>
          </Pressable>
          {isOwner && (
            <Pressable
              onPress={() => {
                actionsSheetRef.current?.dismiss();
                confirmClear();
              }}
              className="flex-row items-center gap-3 py-3.5">
              <Ionicons name="trash-outline" size={20} color={t.danger} />
              <Text className="font-sans text-danger">Clear list</Text>
            </Pressable>
          )}
        </BottomSheetView>
      </BottomSheetModal>
    </View>
  );
}
