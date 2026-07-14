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

const displayName = (u: { displayName: string | null; name: string | null; email: string }) =>
  u.displayName ?? u.name ?? u.email;

export default function FriendsScreen() {
  const { theme } = useTheme();
  const muted = THEME_TOKENS[theme].muted;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const onScroll = useTabBarScrollHandler();

  const [data, setData] = useState<FriendsData>({ friends: [], incoming: [] });
  const [lists, setLists] = useState<Memberships>([]);
  const [email, setEmail] = useState('');
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
    if (!email.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await trpc.friends.sendRequest.mutate({ email: email.trim() });
      setMsg(res.success ?? res.error ?? null);
      setEmail('');
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

        <View className="gap-2">
          <Text className="text-sm uppercase text-muted">Add a friend</Text>
          <TextInput
            className="rounded-skin border-skin border-border px-4 py-3 font-sans text-ink"
            placeholder="Email"
            placeholderTextColor={muted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
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

        {/* Always-visible entry to the full friend-requests view. */}
        <Pressable
          onPress={() => router.push('/friend-requests')}
          className="flex-row items-center justify-between rounded-skin border-skin border-border bg-panel px-4 py-3">
          <View className="flex-row items-center gap-2">
            <Ionicons name="file-tray-outline" size={18} color={muted} />
            <Text className="font-sans-medium text-ink">Friend requests</Text>
          </View>
          <View className="flex-row items-center gap-2">
            {data.incoming.length > 0 && (
              <View className="rounded-full bg-primary px-2 py-0.5">
                <Text className="font-sans-semibold text-xs text-primary-ink">
                  {data.incoming.length}
                </Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={16} color={muted} />
          </View>
        </Pressable>

        {!loaded && <ActivityIndicator />}

        <View className="gap-2">
          <Text className="text-sm uppercase text-muted">Your friends</Text>
          {loaded && data.friends.length === 0 && (
            <Text className="font-serif-italic text-muted">
              No friends yet — add someone by email above.
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
  const router = useRouter();
  const [panel, setPanel] = useState<null | 'edit' | 'add'>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [role, setRole] = useState<InviteRole>('COLLABORATOR');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function openAdd() {
    if (panel === 'add') {
      setPanel(null);
      return;
    }
    setPanel('add');
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
        setPanel(null);
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
      <View className="flex-row items-center justify-between">
        <Pressable
          className="flex-1 pr-2"
          onPress={() =>
            router.push({
              pathname: '/users/[id]',
              params: {
                id: friend.friend.id,
                name: displayName(friend.friend),
              },
            })
          }>
          <Text className="font-sans-medium text-base text-ink">
            {friend.friend.icon ? `${friend.friend.icon} ` : ''}
            {displayName(friend.friend)}
          </Text>
          <Text className="text-xs text-muted">{friend.friend.email}</Text>
        </Pressable>
        <View className="flex-row items-center gap-4">
          <Pressable
            onPress={() => setPanel((p) => (p === 'edit' ? null : 'edit'))}
            hitSlop={8}>
            <Text className="text-primary">Edit</Text>
          </Pressable>
          <Pressable onPress={openAdd} hitSlop={8}>
            <Text className="text-primary">Add</Text>
          </Pressable>
        </View>
      </View>

      {panel === 'edit' && (
        <View className="mt-3 gap-2 border-t border-border pt-3">
          <Pressable
            className="items-center rounded-skin border-skin border-border py-2.5"
            onPress={onRemove}>
            <Text className="font-sans-semibold text-danger">Remove friend</Text>
          </Pressable>
        </View>
      )}

      {panel === 'add' && (
        <View className="mt-3 gap-3 border-t border-border pt-3">
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
