import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
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
import { useHeaderHeight } from '@react-navigation/elements';

import { trpc } from '@/client/api';
import { authClient } from '@/client/auth';
import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';

type Members = Awaited<ReturnType<typeof trpc.sharing.members.query>>;
type Invites = Awaited<ReturnType<typeof trpc.sharing.pendingInvites.query>>;
type InviteRole = 'VIEWER' | 'COLLABORATOR';

export default function MembersScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string; name?: string }>();
  const { data: session } = authClient.useSession();
  const myId = session?.user?.id;
  const { theme } = useTheme();
  const muted = THEME_TOKENS[theme].muted;
  const headerHeight = useHeaderHeight();

  const [members, setMembers] = useState<Members>([]);
  const [invites, setInvites] = useState<Invites>([]);
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<InviteRole>('VIEWER');
  const [msg, setMsg] = useState<string | null>(null);
  const [offerFriend, setOfferFriend] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const isOwner = members.find((m) => m.user.id === myId)?.role === 'OWNER';

  const load = useCallback(() => {
    if (!id) return;
    trpc.sharing.members.query({ listId: id }).then(setMembers).catch(() => {});
    // Owner-only; ignore the 403 for non-owners.
    trpc.sharing.pendingInvites
      .query({ listId: id })
      .then(setInvites)
      .catch(() => setInvites([]))
      .finally(() => setLoaded(true));
  }, [id]);

  useFocusEffect(useCallback(() => load(), [load]));

  async function invite() {
    if (!id || !email.trim()) return;
    setBusy(true);
    setMsg(null);
    setOfferFriend(null);
    try {
      const res = await trpc.sharing.invite.mutate({
        listId: id,
        email: email.trim(),
        role: inviteRole,
      });
      setMsg(res.success ?? res.error ?? null);
      setOfferFriend(res.offerFriend?.email ?? null);
      setEmail('');
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Invite failed');
    }
    setBusy(false);
  }

  async function sendFriendRequest(friendEmail: string) {
    setOfferFriend(null);
    try {
      const res = await trpc.friends.sendRequest.mutate({ email: friendEmail });
      setMsg(res.success ?? res.error ?? null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Request failed');
    }
  }

  async function toggleRole(userId: string, role: InviteRole) {
    if (!id) return;
    await trpc.sharing.changeRole.mutate({
      listId: id,
      userId,
      role: role === 'VIEWER' ? 'COLLABORATOR' : 'VIEWER',
    });
    load();
  }

  async function remove(userId: string) {
    if (!id) return;
    await trpc.sharing.removeMember.mutate({ listId: id, userId });
    load();
  }

  async function revoke(inviteId: string) {
    await trpc.sharing.revokeInvite.mutate({ inviteId });
    load();
  }

  function leave() {
    Alert.alert('Leave list?', 'You will lose access to it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          if (!id) return;
          await trpc.sharing.leave.mutate({ listId: id });
          router.dismissAll();
        },
      },
    ]);
  }

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerStyle={{ padding: 16, paddingTop: headerHeight + 8, gap: 20 }}>
      <Stack.Screen options={{ headerTitle: '' }} />

      <Text className="font-serif text-3xl text-ink">Members</Text>

      {!loaded && <ActivityIndicator />}

      {isOwner && (
        <View className="gap-2">
          <Text className="text-sm uppercase text-muted">Invite</Text>
          <TextInput
            className="rounded-skin border-skin border-border px-4 py-3 text-ink"
            placeholder="Email"
            placeholderTextColor={muted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <View className="flex-row gap-2">
            {(['VIEWER', 'COLLABORATOR'] as InviteRole[]).map((r) => (
              <Pressable
                key={r}
                onPress={() => setInviteRole(r)}
                className={`flex-1 items-center rounded-skin border py-2 ${
                  inviteRole === r ? 'border-primary bg-primary' : 'border-border'
                }`}>
                <Text
                  className={inviteRole === r ? 'text-primary-ink' : 'text-ink'}>
                  {r === 'VIEWER' ? 'Viewer' : 'Collaborator'}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            className="items-center rounded-skin bg-primary py-3"
            disabled={busy}
            onPress={invite}>
            {busy ? (
              <ActivityIndicator color={THEME_TOKENS[theme].primaryInk} />
            ) : (
              <Text className="font-semibold text-primary-ink">Send invite</Text>
            )}
          </Pressable>
          {msg && <Text className="text-muted">{msg}</Text>}
          {offerFriend && (
            <Pressable
              className="items-center rounded-skin border-skin border-border py-2.5"
              onPress={() => sendFriendRequest(offerFriend)}>
              <Text className="text-primary">
                {offerFriend} isn&apos;t your friend — add them?
              </Text>
            </Pressable>
          )}
        </View>
      )}

      <View className="gap-2">
        <Text className="text-sm uppercase text-muted">Members</Text>
        {members.map((m) => (
          <View
            key={m.id}
            className="flex-row items-center justify-between rounded-skin border-skin border-border bg-panel p-3">
            <View className="flex-1 pr-2">
              <Text className="text-base text-ink">
                {m.user.icon ? `${m.user.icon} ` : ''}
                {m.user.displayName ?? m.user.name}
              </Text>
              <Text className="text-xs text-muted">
                {m.user.email} · {m.role.toLowerCase()}
              </Text>
            </View>
            {isOwner && m.role !== 'OWNER' && (
              <View className="flex-row items-center gap-3">
                <Pressable onPress={() => toggleRole(m.user.id, m.role as InviteRole)}>
                  <Text className="text-xs text-primary">
                    {m.role === 'VIEWER' ? 'Make collab' : 'Make viewer'}
                  </Text>
                </Pressable>
                <Pressable onPress={() => remove(m.user.id)} hitSlop={8}>
                  <Text className="text-danger">✕</Text>
                </Pressable>
              </View>
            )}
          </View>
        ))}
      </View>

      {isOwner && invites.length > 0 && (
        <View className="gap-2">
          <Text className="text-sm uppercase text-muted">Pending requests</Text>
          {invites.map((inv) => (
            <View
              key={inv.id}
              className="flex-row items-center justify-between rounded-skin border-skin border-border bg-panel p-3">
              <View className="flex-1 pr-2">
                <Text className="text-base text-ink">{inv.email}</Text>
                <Text className="text-xs text-muted">{inv.role.toLowerCase()}</Text>
              </View>
              <Pressable onPress={() => revoke(inv.id)} hitSlop={8}>
                <Text className="text-danger">Revoke</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {loaded && !isOwner && (
        <Pressable
          className="items-center rounded-skin border-skin border-border py-3"
          onPress={leave}>
          <Text className="font-semibold text-danger">Leave list</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}
