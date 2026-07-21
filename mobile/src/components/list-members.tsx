import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { trpc } from '@/client/api';
import { atHandle } from '@/lib/handle';
import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';

type Members = Awaited<ReturnType<typeof trpc.sharing.members.query>>;
type Invites = Awaited<ReturnType<typeof trpc.sharing.pendingInvites.query>>;
type InviteRole = 'VIEWER' | 'COLLABORATOR';

/**
 * The list's member roster. Rendered as the Members tab on the list screen and
 * shown to every member: the roster + roles are read-only for everyone, while
 * the invite form, per-row role/remove controls, and pending-request list are
 * owner-only. Non-owners get a "Leave list" action instead.
 */
export default function ListMembers({
  listId,
  isOwner,
  onLeave,
}: {
  listId: string;
  isOwner: boolean;
  onLeave?: () => void;
}) {
  const { theme } = useTheme();
  const muted = THEME_TOKENS[theme].muted;

  const [members, setMembers] = useState<Members>([]);
  const [invites, setInvites] = useState<Invites>([]);
  const [handle, setHandle] = useState('');
  const [inviteRole, setInviteRole] = useState<InviteRole>('VIEWER');
  const [msg, setMsg] = useState<string | null>(null);
  const [offerFriend, setOfferFriend] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    if (!listId) return;
    trpc.sharing.members.query({ listId }).then(setMembers).catch(() => {});
    // Owner-only; ignore the 403 for non-owners.
    trpc.sharing.pendingInvites
      .query({ listId })
      .then(setInvites)
      .catch(() => setInvites([]))
      .finally(() => setLoaded(true));
  }, [listId]);

  useFocusEffect(useCallback(() => load(), [load]));

  async function invite() {
    if (!listId || !handle.trim()) return;
    setBusy(true);
    setMsg(null);
    setOfferFriend(null);
    try {
      const res = await trpc.sharing.invite.mutate({
        listId,
        handle: handle.trim(),
        role: inviteRole,
      });
      setMsg(res.success ?? res.error ?? null);
      setOfferFriend(res.offerFriend?.handle ?? null);
      setHandle('');
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Invite failed');
    }
    setBusy(false);
  }

  async function sendFriendRequest(friendHandle: string) {
    setOfferFriend(null);
    try {
      const res = await trpc.friends.sendRequest.mutate({ handle: friendHandle });
      setMsg(res.success ?? res.error ?? null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Request failed');
    }
  }

  async function toggleRole(userId: string, role: InviteRole) {
    if (!listId) return;
    await trpc.sharing.changeRole.mutate({
      listId,
      userId,
      role: role === 'VIEWER' ? 'COLLABORATOR' : 'VIEWER',
    });
    load();
  }

  async function remove(userId: string) {
    if (!listId) return;
    await trpc.sharing.removeMember.mutate({ listId, userId });
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
          if (!listId) return;
          await trpc.sharing.leave.mutate({ listId });
          onLeave?.();
        },
      },
    ]);
  }

  return (
    <View className="gap-5">
      {!loaded && <ActivityIndicator />}

      {isOwner && (
        <View className="gap-2">
          <Text className="text-sm uppercase text-muted">Invite</Text>
          <TextInput
            className="rounded-skin border-skin border-border px-4 py-3 text-ink"
            placeholder="@handle"
            placeholderTextColor={muted}
            autoCapitalize="none"
            autoCorrect={false}
            value={handle}
            onChangeText={setHandle}
          />
          <View className="flex-row gap-2">
            {(['VIEWER', 'COLLABORATOR'] as InviteRole[]).map((r) => (
              <Pressable
                key={r}
                onPress={() => setInviteRole(r)}
                className={`flex-1 items-center rounded-skin border py-2 ${
                  inviteRole === r ? 'border-primary bg-primary' : 'border-border'
                }`}>
                <Text className={inviteRole === r ? 'text-primary-ink' : 'text-ink'}>
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
                @{offerFriend} isn&apos;t your friend — add them?
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
                {atHandle(m.user.handle)}
              </Text>
              <Text className="text-xs text-muted">{m.role.toLowerCase()}</Text>
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
                <Text className="text-base text-ink">{atHandle(inv.handle)}</Text>
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
    </View>
  );
}
