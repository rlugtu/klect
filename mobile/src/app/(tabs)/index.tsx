import { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import ReorderableList, {
  reorderItems,
  useReorderableDrag,
} from 'react-native-reorderable-list';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';

import { trpc } from '@/client/api';
import FloatingStatusBar from '@/components/floating-status-bar';
import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';
import { cardShadow } from '@/theme/shadows';
import { useTabBarScrollHandler } from '@/theme/tab-bar-scroll';

// Inferred straight from web's tRPC procedure — no hand-written DTOs.
type Memberships = Awaited<ReturnType<typeof trpc.lists.mine.query>>;
type Membership = Memberships[number];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A list card. When draggable, a long-press anywhere starts the reorder drag. */
function ListCard({
  item,
  draggable,
  onOpen,
}: {
  item: Membership;
  draggable: boolean;
  onOpen: () => void;
}) {
  return draggable ? (
    <DraggableCard item={item} onOpen={onOpen} />
  ) : (
    <CardBody item={item} onOpen={onOpen} />
  );
}

function DraggableCard({ item, onOpen }: { item: Membership; onOpen: () => void }) {
  const drag = useReorderableDrag();
  return <CardBody item={item} onOpen={onOpen} onLongPress={drag} />;
}

function CardBody({
  item,
  onOpen,
  onLongPress,
}: {
  item: Membership;
  onOpen: () => void;
  onLongPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onOpen}
      onLongPress={onLongPress}
      delayLongPress={200}
      style={cardShadow}
      className="rounded-skin border-skin border-border bg-panel p-4">
      <Text className="font-serif text-xl text-ink">
        {item.list.icon} {item.list.name}
      </Text>
      <Text className="mt-0.5 font-sans text-sm text-muted">
        {plural(item.list._count.bookmarks, 'bookmark')} ·{' '}
        {plural(item.list._count.memberships, 'member')}
      </Text>
    </Pressable>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const muted = THEME_TOKENS[theme].muted;
  const insets = useSafeAreaInsets();
  const onScroll = useTabBarScrollHandler();

  const [lists, setLists] = useState<Memberships>([]);
  const [requestCount, setRequestCount] = useState(0);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    trpc.lists.mine
      .query()
      .then(setLists)
      .catch((e) => setError(e instanceof Error ? e.message : 'Request failed'))
      .finally(() => setLoading(false));
    trpc.sharing.incomingRequests
      .query()
      .then((r) => setRequestCount(r.length))
      .catch(() => {});
  }, []);

  useFocusEffect(useCallback(() => load(), [load]));

  const filtering = query.trim() !== '';
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return lists;
    return lists.filter((m) => m.list.name.toLowerCase().includes(q));
  }, [lists, query]);

  function persistOrder(next: Memberships) {
    trpc.lists.reorder
      .mutate({ orderedListIds: next.map((m) => m.list.id) })
      .catch(() => load()); // reload to resync if the write fails
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
          onPress={() => router.push('/requests')}
          className="flex-row items-center gap-1.5"
          hitSlop={8}>
          <Ionicons name="file-tray-outline" size={18} color={muted} />
          <Text className="font-sans-medium text-muted">Requests</Text>
          {requestCount > 0 && (
            <View className="rounded-full bg-primary px-2 py-0.5">
              <Text className="font-sans-semibold text-xs text-primary-ink">
                {requestCount}
              </Text>
            </View>
          )}
        </Pressable>
        <Pressable onPress={() => router.push('/lists/new')} hitSlop={8}>
          <Text className="font-sans-semibold text-base text-primary">+ List</Text>
        </Pressable>
      </View>

      <View className="flex-row items-center gap-2 rounded-skin border-skin border-border bg-panel px-3">
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

      {loading && <Text className="font-sans text-muted">Loading…</Text>}
      {error && <Text className="font-sans text-danger">{error}</Text>}
      {!loading && !error && shown.length === 0 && (
        <Text className="font-serif-italic text-muted">
          {query ? 'No lists match.' : 'No lists yet — tap + List.'}
        </Text>
      )}
    </View>
  );

  const contentContainerStyle = {
    padding: 16,
    paddingTop: insets.top + 8,
    paddingBottom: 120,
    gap: 16,
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['left', 'right']} className="bg-bg">
      {filtering ? (
        <Animated.FlatList
          data={shown}
          keyExtractor={(m) => m.list.id}
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={contentContainerStyle}
          ListHeaderComponent={header}
          renderItem={({ item }) => (
            <ListCard item={item} draggable={false} onOpen={() => openList(item)} />
          )}
        />
      ) : (
        <ReorderableList
          data={lists}
          keyExtractor={(m) => m.list.id}
          onScroll={onScroll}
          contentContainerStyle={contentContainerStyle}
          ListHeaderComponent={header}
          onReorder={({ from, to }) => {
            const next = reorderItems(lists, from, to);
            setLists(next);
            persistOrder(next);
          }}
          renderItem={({ item }) => (
            <ListCard item={item} draggable onOpen={() => openList(item)} />
          )}
        />
      )}
      <FloatingStatusBar />
    </SafeAreaView>
  );
}
