import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';

import { trpc } from '@/client/api';
import { atHandle } from '@/lib/handle';
import FloatingStatusBar from '@/components/floating-status-bar';
import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';
import { cardShadow } from '@/theme/shadows';
import { useTabBarScrollHandler } from '@/theme/tab-bar-scroll';

// Inferred straight from web's tRPC procedures — no hand-written DTOs.
type FriendsData = Awaited<ReturnType<typeof trpc.friends.list.query>>;
type Memberships = Awaited<ReturnType<typeof trpc.lists.mine.query>>;
type Friend = FriendsData['friends'][number];
type InviteRole = 'VIEWER' | 'COLLABORATOR';

export default function FriendsScreen() {
  const { theme } = useTheme();
  const muted = THEME_TOKENS[theme].muted;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const onScroll = useTabBarScrollHandler();

  const [data, setData] = useState<FriendsData>({
    friends: [],
    incoming: [],
    outgoing: [],
  });
  const [lists, setLists] = useState<Memberships>([]);
  const [handle, setHandle] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const ownedLists = useMemo(
    () => lists.filter((m) => m.role === 'OWNER'),
    [lists],
  );

  const load = useCallback(() => {
    trpc.friends.list
      .query()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoaded(true));
    trpc.lists.mine.query().then(setLists).catch(() => {});
  }, []);

  useFocusEffect(useCallback(() => load(), [load]));

  async function addFriend() {
    if (!handle.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await trpc.friends.sendRequest.mutate({ handle: handle.trim() });
      setMsg(res.success ?? res.error ?? null);
      setHandle('');
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Request failed');
    }
    setBusy(false);
  }

  function confirmRemove(id: string) {
    Alert.alert('Remove friend?', 'You can add them again later.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await trpc.friends.remove.mutate({ id });
          load();
        },
      },
    ]);
  }

  return (
    <SafeAreaView
      style={{ flex: 1 }}
      edges={['left', 'right']}
      className="bg-bg">
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{
          padding: 16,
          paddingTop: insets.top + 16,
          paddingBottom: 120,
          gap: 20,
        }}>
        <Text className="font-serif text-3xl text-ink">Friends</Text>

        {/* Pending and Requests pushed to opposite edges so they read as a pair of
            balanced actions rather than a left-packed cluster. */}
        <View className="flex-row items-center justify-between">
          <Pressable
            onPress={() => router.push('/pending-requests')}
            className="flex-row items-center gap-1.5 rounded-skin border-skin border-border bg-panel px-3 py-2">
            <Ionicons name="paper-plane-outline" size={16} color={muted} />
            <Text className="font-sans-medium text-sm text-ink">Pending</Text>
            {data.outgoing.length > 0 && (
              <View className="rounded-full bg-primary px-2 py-0.5">
                <Text className="font-sans-semibold text-xs text-primary-ink">
                  {data.outgoing.length}
                </Text>
              </View>
            )}
          </Pressable>
          <Pressable
            onPress={() => router.push('/friend-requests')}
            className="flex-row items-center gap-1.5 rounded-skin border-skin border-border bg-panel px-3 py-2">
            <Ionicons name="file-tray-outline" size={16} color={muted} />
            <Text className="font-sans-medium text-sm text-ink">Requests</Text>
            {data.incoming.length > 0 && (
              <View className="rounded-full bg-primary px-2 py-0.5">
                <Text className="font-sans-semibold text-xs text-primary-ink">
                  {data.incoming.length}
                </Text>
              </View>
            )}
          </Pressable>
        </View>

        <View className="gap-2">
          <Text className="text-sm uppercase text-muted">Add a friend</Text>
          <TextInput
            className="rounded-skin border-skin border-border px-4 py-3 font-sans text-ink"
            placeholder="@handle"
            placeholderTextColor={muted}
            autoCapitalize="none"
            autoCorrect={false}
            value={handle}
            onChangeText={setHandle}
          />
          <Pressable
            className="items-center rounded-skin bg-primary py-3"
            disabled={busy}
            onPress={addFriend}>
            {busy ? (
              <ActivityIndicator color={THEME_TOKENS[theme].primaryInk} />
            ) : (
              <Text className="font-sans-semibold text-primary-ink">
                Send request
              </Text>
            )}
          </Pressable>
          {msg && <Text className="font-sans text-muted">{msg}</Text>}
        </View>

        {!loaded && <ActivityIndicator />}

        <View className="gap-2">
          <Text className="text-sm uppercase text-muted">Your friends</Text>
          {loaded && data.friends.length === 0 && (
            <Text className="font-serif-italic text-muted">
              No friends yet — add someone by @handle above.
            </Text>
          )}
          {data.friends.map((f) => (
            <FriendCard
              key={f.friendshipId}
              friend={f}
              ownedLists={ownedLists}
              onRemove={() => confirmRemove(f.friendshipId)}
              onSubmitted={load}
            />
          ))}
        </View>
      </Animated.ScrollView>
      <FloatingStatusBar />
    </SafeAreaView>
  );
}

function FriendCard({
  friend,
  ownedLists,
  onRemove,
  onSubmitted,
}: {
  friend: Friend;
  ownedLists: Memberships;
  onRemove: () => void;
  onSubmitted: () => void;
}) {
  const { theme } = useTheme();
  const t = THEME_TOKENS[theme];
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [role, setRole] = useState<InviteRole>('COLLABORATOR');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Tapping anywhere on the row opens the actions panel; opening it also loads which
  // lists this friend already belongs to (to pre-select the "add to lists" chips).
  async function togglePanel() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    setMsg(null);
    try {
      const ids = await trpc.friends.friendListIds.query({
        friendId: friend.friend.id,
        listIds: ownedLists.map((m) => m.list.id),
      });
      setSelected(ids);
    } catch {
      setSelected([]);
    }
  }

  function viewProfile() {
    router.push({
      pathname: '/users/[handle]',
      params: {
        handle: friend.friend.handle ?? friend.friend.id,
        name: atHandle(friend.friend.handle),
      },
    });
  }

  function toggle(id: string) {
    setSelected((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    );
  }

  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await trpc.friends.addToLists.mutate({
        friendId: friend.friend.id,
        listIds: selected,
        role,
      });
      if (res.error) {
        setMsg(res.error);
      } else {
        setOpen(false);
        onSubmitted();
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed');
    }
    setBusy(false);
  }

  return (
    <View
      style={cardShadow}
      className="rounded-skin border-skin border-border bg-panel p-3">
      {/* The whole row is the toggle for the actions panel. */}
      <Pressable
        className="flex-row items-center justify-between"
        onPress={togglePanel}>
        <View className="flex-1 pr-2">
          <Text className="font-sans-medium text-base text-ink">
            {friend.friend.icon ? `${friend.friend.icon} ` : ''}
            {atHandle(friend.friend.handle)}
          </Text>
        </View>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={t.muted}
        />
      </Pressable>

      {open && (
        <View className="mt-3 gap-3 border-t border-border pt-3">
          {/* Remove + View profile, above the add-to-lists section. */}
          <View className="flex-row gap-2">
            <Pressable
              className="flex-1 flex-row items-center justify-center gap-1.5 rounded-skin border-skin border-border py-2.5"
              onPress={onRemove}>
              <Ionicons name="person-remove-outline" size={16} color={t.danger} />
              <Text className="font-sans-semibold text-danger">Remove</Text>
            </Pressable>
            <Pressable
              className="flex-1 flex-row items-center justify-center gap-1.5 rounded-skin border-skin border-border py-2.5"
              onPress={viewProfile}>
              <Ionicons name="person-circle-outline" size={16} color={t.primary} />
              <Text className="font-sans-semibold text-primary">View profile</Text>
            </Pressable>
          </View>

          <Text className="text-sm text-muted">Add to lists</Text>
          {ownedLists.length === 0 ? (
            <Text className="text-sm text-muted">You don&apos;t own any lists yet.</Text>
          ) : (
            <>
              <View className="flex-row flex-wrap gap-2">
                {ownedLists.map((m) => {
                  const on = selected.includes(m.list.id);
                  return (
                    <Pressable
                      key={m.list.id}
                      onPress={() => toggle(m.list.id)}
                      className={`flex-row items-center gap-1.5 rounded-skin-sm border-skin px-2 py-1 ${
                        on ? 'border-primary bg-primary/20' : 'border-border bg-panel'
                      }`}>
                      <Text className="text-ink">{m.list.icon}</Text>
                      <Text className="text-sm text-ink" numberOfLines={1}>
                        {m.list.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <View className="flex-row gap-2">
                {(['VIEWER', 'COLLABORATOR'] as InviteRole[]).map((r) => (
                  <Pressable
                    key={r}
                    onPress={() => setRole(r)}
                    className={`flex-1 items-center rounded-skin border py-2 ${
                      role === r ? 'border-primary bg-primary' : 'border-border'
                    }`}>
                    <Text className={role === r ? 'text-primary-ink' : 'text-ink'}>
                      {r === 'VIEWER' ? 'Viewer' : 'Collaborator'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Pressable
                className="items-center rounded-skin bg-primary py-3"
                disabled={busy}
                onPress={submit}>
                {busy ? (
                  <ActivityIndicator color={THEME_TOKENS[theme].primaryInk} />
                ) : (
                  <Text className="font-sans-semibold text-primary-ink">
                    Send requests
                  </Text>
                )}
              </Pressable>
            </>
          )}
          {msg && <Text className="text-danger">{msg}</Text>}
        </View>
      )}
    </View>
  );
}
