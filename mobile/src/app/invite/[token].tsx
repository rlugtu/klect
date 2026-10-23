import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useHeaderHeight } from '@react-navigation/elements';

import { trpc } from '@/client/api';
import { toast, errorMessage } from '@/client/toast';
import Skeleton from '@/components/skeleton';
import FloatingStatusBar from '@/components/floating-status-bar';
import { atHandle } from '@/lib/handle';
import { cardShadow } from '@/theme/shadows';

type Invite = Awaited<ReturnType<typeof trpc.sharing.inviteByToken.query>>;

// An invite only ever carries VIEWER or COLLABORATOR (ownership isn't invitable), so the
// label collapses the same way web's page does.
const roleLabel = (role: NonNullable<Invite>['role']) =>
  role === 'COLLABORATOR' ? 'Collaborator' : 'Viewer';

/**
 * The target of an invite link (`klect.app/invite/<token>`), which iOS/Android hand to
 * the app as a universal link / app link (see `app.json`'s `associatedDomains` + `intentFilters`
 * and web's `/.well-known/*` routes). Mirrors web's `/invite/[token]` page: not-found, already a
 * member, or accept — then straight into the list.
 *
 * There is no signed-out state here: `_layout.tsx` gates the whole navigator behind a session, so
 * a link that arrives before sign-in parks its token (`client/pending-invite.ts`) and lands here
 * once the authenticated stack mounts.
 */
export default function InviteScreen() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token: string }>();
  const headerHeight = useHeaderHeight();
  const [invite, setInvite] = useState<Invite>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    trpc.sharing.inviteByToken
      .query({ token })
      .then((i) => {
        setInvite(i);
        setError(null);
      })
      .catch((e) => setError(errorMessage(e, 'Could not load this invite')))
      .finally(() => setLoading(false));
  }, [token]);

  // Deliberately not `useFocusEffect`: re-reading the invite when the screen regains
  // focus would flip an accepted invite into its "already a member" face mid-navigation.
  useEffect(() => load(), [load]);

  function openList(listId: string, name: string) {
    router.replace({ pathname: '/lists/[id]', params: { id: listId, name } });
  }

  async function accept() {
    if (!invite || joining) return;
    setJoining(true);
    try {
      const joined = await trpc.sharing.accept.mutate({ token });
      // The token was revoked between the read above and this tap.
      if (!joined) {
        setInvite(null);
        setJoining(false);
        toast.error('This invite link is no longer valid');
        return;
      }
      toast.success(`Joined ${invite.list.name}`);
      openList(joined.listId, invite.list.name);
    } catch (e) {
      setJoining(false);
      toast.error(errorMessage(e, 'Could not accept this invite'));
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['left', 'right']} className="bg-bg">
      <Stack.Screen options={{ headerTitle: '' }} />
      <Animated.ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingTop: headerHeight + 8,
          paddingBottom: 40,
          gap: 12,
        }}>
        <Text className="font-serif text-3xl text-ink">List invite</Text>

        {loading && (
          <View className="gap-3">
            <Skeleton height={140} />
            <Skeleton height={48} />
          </View>
        )}

        {!loading && error && (
          <View className="gap-3">
            <Text className="font-sans text-danger">{error}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Try again"
              onPress={load}
              hitSlop={8}
              className="self-start rounded-skin border-skin border-border px-4 py-3">
              <Text className="font-sans-semibold text-ink">Try again</Text>
            </Pressable>
          </View>
        )}

        {!loading && !error && !invite && (
          <View
            style={cardShadow}
            className="items-center gap-3 rounded-skin border-skin border-border bg-panel p-5">
            <Text className="font-serif text-lg text-ink">Invite not found</Text>
            <Text className="text-center font-sans text-muted">
              This invite link is invalid or was revoked.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go home"
              onPress={() => router.replace('/')}
              hitSlop={8}
              className="rounded-skin border-skin border-border px-4 py-3">
              <Text className="font-sans-semibold text-ink">Go home</Text>
            </Pressable>
          </View>
        )}

        {!loading && !error && invite && (
          <View
            style={cardShadow}
            className="items-center gap-3 rounded-skin border-skin border-border bg-panel p-5">
            <Text className="text-5xl text-ink">{invite.list.icon}</Text>
            <Text className="text-center font-serif text-lg text-ink">
              {invite.list.name}
            </Text>
            <Text className="font-sans text-muted">
              {atHandle(invite.invitedBy.handle)} invited you to join as
            </Text>
            <View className="rounded-full bg-primary px-3 py-1">
              <Text className="font-sans-semibold text-xs text-primary-ink">
                {roleLabel(invite.role)}
              </Text>
            </View>

            {invite.alreadyMember ? (
              <>
                <Text className="font-sans text-success">
                  You&apos;re already a member.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${invite.list.name}`}
                  onPress={() => openList(invite.list.id, invite.list.name)}
                  hitSlop={8}
                  className="w-full items-center rounded-skin bg-primary px-4 py-3">
                  <Text className="font-sans-semibold text-primary-ink">
                    Open list
                  </Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Accept invite to ${invite.list.name}`}
                accessibilityState={{ disabled: joining }}
                disabled={joining}
                onPress={accept}
                hitSlop={8}
                className="w-full items-center rounded-skin bg-primary px-4 py-3">
                <Text className="font-sans-semibold text-primary-ink">
                  {joining ? 'Joining…' : 'Accept invite'}
                </Text>
              </Pressable>
            )}
          </View>
        )}
      </Animated.ScrollView>
      <FloatingStatusBar />
    </SafeAreaView>
  );
}
