import { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import ReorderableList, {
  reorderItems,
  useReorderableDrag,
} from 'react-native-reorderable-list';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';

import { trpc } from '@/client/api';
import { useEntitlements } from '@/client/entitlements';
import { writeSharedLists } from '@/client/shared-lists-cache';
import { toast, errorMessage } from '@/client/toast';
import FloatingStatusBar from '@/components/floating-status-bar';
import LockedBadge, { LOCKED_OPACITY, ReclaimBanner } from '@/components/locked-badge';
import Skeleton from '@/components/skeleton';
import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';
import { cardShadow } from '@/theme/shadows';
import { useTabBarScrollHandler } from '@/theme/tab-bar-scroll';

// Inferred straight from web's tRPC procedure — no hand-written DTOs.
type Memberships = Awaited<ReturnType<typeof trpc.lists.mine.query>>;
type Membership = Memberships[number];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Non-owner lists get a small badge so shared lists read differently from your own (parity with
// web's ListCard). Owned lists show nothing.
const ROLE_LABEL: Record<Membership['role'], string | null> = {
  OWNER: null,
  COLLABORATOR: 'Collab',
  VIEWER: 'Viewer',
};

/** A "Collab" / "Viewer" pill; renders nothing for owned lists. */
function RoleBadge({ role }: { role: Membership['role'] }) {
  const label = ROLE_LABEL[role];
  if (!label) return null;
  return (
    <View className="rounded-full border-skin border-border bg-panel px-2 py-0.5">
      <Text className="font-sans-medium text-xs text-muted">{label}</Text>
    </View>
  );
}

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
  // Frozen by the free-tier downgrade flow. Locked is read-only, never hidden, so
  // the card keeps its full surface and stays tappable (and draggable). Only its
  // contents dim, and a Locked pill says why.
  const locked = item.list.lockedAt != null;
  const dim = locked ? { opacity: LOCKED_OPACITY } : undefined;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.list.name}, ${plural(
        item.list._count.bookmarks,
        'bookmark',
      )}, ${plural(item.list._count.memberships, 'member')}${
        locked ? ', locked, read only' : ''
      }`}
      accessibilityHint={
        onLongPress ? 'Double tap and hold to reorder this list' : undefined
      }
      onPress={onOpen}
      onLongPress={onLongPress}
      delayLongPress={200}
      style={cardShadow}
      className="rounded-skin border-skin border-border bg-panel p-4">
      <View className="flex-row items-center gap-2">
        <Text className="flex-shrink font-serif text-xl text-ink" style={dim}>
          {item.list.icon} {item.list.name}
        </Text>
        {/* Role stays at full strength: it's a fact about the list, not part of
            what the lock greys out. (And RoleBadge renders nothing for OWNER, so
            it must not be wrapped: a wrapper View would leave a stray gap.) */}
        <RoleBadge role={item.role} />
        {locked && <LockedBadge />}
      </View>
      <Text className="mt-0.5 font-sans text-sm text-muted" style={dim}>
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
  // Whether the account has room to unlock rows it locked on a past downgrade. Read from the
  // shared entitlements status, never recomputed from the counts below. Web's
  // `core/active-selection.ts` is the single authority on that.
  const { status } = useEntitlements();

  const [lists, setLists] = useState<Memberships>([]);
  const [requestCount, setRequestCount] = useState(0);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Dismissal is for this run of the app only, not persisted. Reclaiming is a transient state
  // the user can act on in one tap, and it stops being offered the moment they do (or the
  // moment the room disappears), so there is nothing here worth remembering across launches.
  const [reclaimDismissed, setReclaimDismissed] = useState(false);

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
      .catch((e) => {
        // The rows already moved optimistically, so say why they're about to jump back.
        toast.error(errorMessage(e, 'Could not save the new order'));
        load(); // reload to resync with the order the server still has
      });
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

      {loading && (
        // Card-shaped placeholders, same idiom as the poll screens.
        <View className="gap-4">
          <Skeleton height={76} />
          <Skeleton height={76} />
          <Skeleton height={76} />
        </View>
      )}
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
      {/* One list, always mounted — the search TextInput lives in its header, so swapping
          list components while filtering would unmount it and drop keyboard focus after the
          first keystroke. Instead we drive the same ReorderableList off `shown` and just
          disable dragging while filtering (a filtered view can't be meaningfully reordered). */}
      <ReorderableList
        data={shown}
        keyExtractor={(m) => m.list.id}
        onScroll={onScroll}
        contentContainerStyle={contentContainerStyle}
        ListHeaderComponent={header}
        onReorder={({ from, to }) => {
          if (filtering) return; // guard: indices are only valid against the full list
          const next = reorderItems(lists, from, to);
          setLists(next);
          persistOrder(next);
        }}
        renderItem={({ item }) => (
          <ListCard
            item={item}
            draggable={!filtering}
            onOpen={() => openList(item)}
          />
        )}
      />
      <FloatingStatusBar />
    </SafeAreaView>
  );
}
