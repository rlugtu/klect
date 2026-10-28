import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Sortable from 'react-native-sortables';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';

import { trpc } from '@/client/api';
import { useEntitlements } from '@/client/entitlements';
import { writeSharedLists } from '@/client/shared-lists-cache';
import { toast, errorMessage } from '@/client/toast';
import FloatingStatusBar from '@/components/floating-status-bar';
import ListRow, { ROW_HEIGHT } from '@/components/list-row';
import ListTile, {
  TILE_COLUMNS,
  TILE_COLUMN_GAP,
  TILE_ROW_GAP,
  TILE_SIDE_PADDING,
  tileHeight,
  useTileWidth,
} from '@/components/list-tile';
import { ReclaimBanner } from '@/components/locked-badge';
import RecentBookmarksStrip from '@/components/recent-bookmarks-strip';
import Skeleton from '@/components/skeleton';
import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';
import { useTabBarScrollHandler } from '@/theme/tab-bar-scroll';

// Inferred straight from web's tRPC procedure — no hand-written DTOs.
type Memberships = Awaited<ReturnType<typeof trpc.lists.mine.query>>;
type Membership = Memberships[number];
type RecentBookmarks = Awaited<ReturnType<typeof trpc.bookmarks.recent.query>>['items'];

/** How many cards the Home strip asks for. Enough to scroll, few enough to stay cheap. */
const RECENT_LIMIT = 8;

/**
 * How "Your lists" is laid out: a grid of photo tiles, or compact full-width rows. Per device and
 * remembered across launches. Secure-store because it is the app's one local key-value store (the
 * theme lives there too); nothing secret about it.
 */
type ViewMode = 'tiles' | 'list';
const VIEW_MODE_KEY = 'klect.home-view-mode';

export default function HomeScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const muted = THEME_TOKENS[theme].muted;
  const insets = useSafeAreaInsets();
  const onScroll = useTabBarScrollHandler();
  // Lets the grid auto-scroll while a tile is dragged toward either edge.
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const tileWidth = useTileWidth();
  // Whether the account has room to unlock rows it locked on a past downgrade. Read from the
  // shared entitlements status, never recomputed from the counts below. Web's
  // `core/active-selection.ts` is the single authority on that.
  const { status } = useEntitlements();

  const [lists, setLists] = useState<Memberships>([]);
  const [recentBookmarks, setRecentBookmarks] = useState<RecentBookmarks>([]);
  // Separate from `loading` (which only tracks lists.mine): the two requests are independent and
  // unawaited, so lists can finish first and flip `loading` false while this one is still in
  // flight. The strip needs its own flag or it hides itself before its own fetch ever lands.
  const [recentLoading, setRecentLoading] = useState(true);
  const [requestCount, setRequestCount] = useState(0);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Dismissal is for this run of the app only, not persisted. Reclaiming is a transient state
  // the user can act on in one tap, and it stops being offered the moment they do (or the
  // moment the room disappears), so there is nothing here worth remembering across launches.
  const [reclaimDismissed, setReclaimDismissed] = useState(false);
  // Tiles until the stored preference says otherwise, so the first frame is never the wrong one
  // for a new install.
  const [viewMode, setViewMode] = useState<ViewMode>('tiles');

  const load = useCallback(() => {
    trpc.lists.mine
      .query()
      .then((next) => {
        setLists(next);
        // Keep the share extension's instant-hydration snapshot fresh (it's a cold, separate
        // process that can only read the shared keychain). This is the single choke point.
        writeSharedLists(next);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Request failed'))
      .finally(() => setLoading(false));
    trpc.sharing.incomingRequests
      .query()
      .then((r) => setRequestCount(r.length))
      .catch(() => {});
    // On the same refetch-on-focus lifecycle as the lists above, deliberately: a bookmark saved
    // on another screen (or by the share extension) has to be in the strip when Home comes back.
    trpc.bookmarks.recent
      .query({ limit: RECENT_LIMIT })
      .then((page) => setRecentBookmarks(page.items))
      .catch(() => {})
      .finally(() => setRecentLoading(false));
  }, []);

  useFocusEffect(useCallback(() => load(), [load]));

  useEffect(() => {
    SecureStore.getItemAsync(VIEW_MODE_KEY)
      .then((v) => {
        if (v === 'list') setViewMode('list');
      })
      .catch(() => {});
  }, []);

  function toggleViewMode() {
    const next: ViewMode = viewMode === 'tiles' ? 'list' : 'tiles';
    setViewMode(next);
    SecureStore.setItemAsync(VIEW_MODE_KEY, next).catch(() => {});
  }

  const filtering = query.trim() !== '';
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return lists;
    return lists.filter((m) => m.list.name.toLowerCase().includes(q));
  }, [lists, query]);

  function persistOrder(next: Memberships) {
    trpc.lists.reorder
      .mutate({ orderedListIds: next.map((m) => m.list.id) })
      .catch((e) => {
        // The rows already moved optimistically, so say why they're about to jump back.
        toast.error(errorMessage(e, 'Could not save the new order'));
        load(); // reload to resync with the order the server still has
      });
  }

  /** Moves one list a single step: the VoiceOver equivalent of a drag, on the same path. */
  function moveBy(listId: string, delta: -1 | 1) {
    const index = lists.findIndex((m) => m.list.id === listId);
    const to = index + delta;
    if (filtering || index < 0 || to < 0 || to >= lists.length) return;
    const next = [...lists];
    [next[index], next[to]] = [next[to], next[index]];
    setLists(next);
    persistOrder(next);
  }

  function openList(item: Membership) {
    router.push({
      pathname: '/lists/[id]',
      params: { id: item.list.id, name: item.list.name },
    });
  }

  const header = (
    <View className="gap-3 pb-1">
      <Text className="font-serif text-3xl text-ink">Klect</Text>

      {/* Requests inbox + create-list, sharing one slim row above a divider so it
          reads as a toolbar — not another list card. */}
      <View className="flex-row items-center justify-between border-b border-border pb-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`List invites${
            requestCount > 0 ? `, ${requestCount} to review` : ''
          }`}
          onPress={() => router.push('/requests')}
          className="flex-row items-center gap-1.5"
          hitSlop={8}>
          <Ionicons name="file-tray-outline" size={20} color={muted} />
          <Text className="font-sans-medium text-lg text-muted">List invites</Text>
          {requestCount > 0 && (
            <View className="rounded-full bg-primary px-2 py-0.5">
              <Text className="font-sans-semibold text-xs text-primary-ink">
                {requestCount}
              </Text>
            </View>
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New list"
          onPress={() => router.push('/lists/new')}
          hitSlop={8}>
          <Text className="font-sans-semibold text-lg text-primary">+ List</Text>
        </Pressable>
      </View>

      {/* Only entry point back into the downgrade-selection screen once `needsSelection` has
          gone false. A prompt, never a gate. See the note on EntitlementGate in _layout.tsx. */}
      {status?.canReclaim && !reclaimDismissed && (
        <ReclaimBanner
          onReview={() => router.push('/downgrade')}
          onDismiss={() => setReclaimDismissed(true)}
        />
      )}

      <RecentBookmarksStrip items={recentBookmarks} loading={recentLoading} />

      <View className="flex-row items-stretch gap-2">
        <View className="flex-1 flex-row items-center gap-2 rounded-skin border-skin border-border bg-panel px-3">
          <Ionicons name="search" size={18} color={muted} />
          <TextInput
            className="flex-1 py-3 font-sans text-base text-ink"
            placeholder="Search lists"
            placeholderTextColor={muted}
            autoCapitalize="none"
            value={query}
            onChangeText={setQuery}
          />
        </View>
        {/* Layout mode. A sibling of the search box, never a parent, so toggling it can't
            remount the TextInput and drop keyboard focus. The icon previews the layout a tap
            switches to. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={viewMode === 'tiles' ? 'Show lists as rows' : 'Show lists as tiles'}
          onPress={toggleViewMode}
          hitSlop={4}
          className="aspect-square items-center justify-center rounded-skin border-skin border-border bg-panel">
          <Ionicons
            name={viewMode === 'tiles' ? 'list-outline' : 'grid-outline'}
            size={18}
            color={muted}
          />
        </Pressable>
      </View>

      {loading &&
        // Placeholders in whichever geometry the grid is about to use, same idiom as the poll
        // screens: two rows of tiles, or six compact rows.
        (viewMode === 'tiles' ? (
          <View
            className="flex-row flex-wrap"
            style={{ columnGap: TILE_COLUMN_GAP, rowGap: TILE_ROW_GAP }}>
            {Array.from({ length: TILE_COLUMNS * 2 }, (_, i) => (
              <View key={i} style={{ width: tileWidth }}>
                <Skeleton height={tileHeight(tileWidth)} />
              </View>
            ))}
          </View>
        ) : (
          <View style={{ rowGap: TILE_ROW_GAP }}>
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} height={ROW_HEIGHT} />
            ))}
          </View>
        ))}
      {error && <Text className="font-sans text-danger">{error}</Text>}
      {!loading && !error && shown.length === 0 && (
        <Text className="font-serif-italic text-muted">
          {query ? 'No lists match.' : 'No lists yet — tap + List.'}
        </Text>
      )}
    </View>
  );

  const contentContainerStyle = {
    padding: TILE_SIDE_PADDING,
    paddingTop: insets.top + 8,
    paddingBottom: 120,
    gap: 16,
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['left', 'right']} className="bg-bg">
      {/* One scroll view, always mounted: the search TextInput lives in its header, so
          swapping components while filtering would unmount it and drop keyboard focus after
          the first keystroke. Instead the same grid is driven off `shown`, with sorting just
          switched off while filtering (a filtered view can't be meaningfully reordered). */}
      <Animated.ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={contentContainerStyle}>
        {header}
        <Sortable.Grid
          // The library re-measures on a column-count change, so no remount (or key) needed.
          columns={viewMode === 'tiles' ? TILE_COLUMNS : 1}
          columnGap={TILE_COLUMN_GAP}
          rowGap={TILE_ROW_GAP}
          data={shown}
          keyExtractor={(m) => m.list.id}
          sortEnabled={!filtering}
          scrollableRef={scrollRef}
          onDragEnd={({ data, fromIndex, toIndex }) => {
            // guard: the order is only meaningful against the full, unfiltered list
            if (filtering || fromIndex === toIndex) return;
            setLists(data);
            persistOrder(data);
          }}
          renderItem={({ item, index }) => {
            const Item = viewMode === 'tiles' ? ListTile : ListRow;
            return (
              <Item
                item={item}
                onOpen={() => openList(item)}
                onMoveEarlier={
                  !filtering && index > 0 ? () => moveBy(item.list.id, -1) : undefined
                }
                onMoveLater={
                  !filtering && index < shown.length - 1
                    ? () => moveBy(item.list.id, 1)
                    : undefined
                }
              />
            );
          }}
        />
      </Animated.ScrollView>
      <FloatingStatusBar />
    </SafeAreaView>
  );
}
