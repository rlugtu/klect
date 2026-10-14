import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { Stack, useFocusEffect } from 'expo-router';
import { useHeaderHeight } from '@react-navigation/elements';

import { trpc } from '@/client/api';
import { toast, errorMessage } from '@/client/toast';
import { atHandle } from '@/lib/handle';
import { cardShadow } from '@/theme/shadows';

type Requests = Awaited<ReturnType<typeof trpc.sharing.incomingRequests.query>>;

// Text-only rows can't reach Apple's 44pt minimum from padding alone.
const TAP_TARGET = { minHeight: 44, justifyContent: 'center' } as const;

/**
 * Incoming invites to join someone else's list: approve or reject. Distinct from the
 * Friends tab's friend requests and from a list owner's own sent invites.
 */
export default function RequestsScreen() {
  const headerHeight = useHeaderHeight();
  const [requests, setRequests] = useState<Requests>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    trpc.sharing.incomingRequests
      .query()
      .then((r) => {
        setRequests(r);
        setError(null);
      })
      .catch((e) => setError(errorMessage(e, 'Could not load list invites')))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => load(), [load]));

  async function decide(inviteId: string, decision: 'approve' | 'reject') {
    setRequests((cur) => cur.filter((r) => r.id !== inviteId));
    try {
      if (decision === 'approve') {
        await trpc.sharing.approveRequest.mutate({ inviteId });
      } else {
        await trpc.sharing.rejectRequest.mutate({ inviteId });
      }
      toast.success(decision === 'approve' ? 'Invite approved' : 'Invite rejected');
    } catch (e) {
      toast.error(errorMessage(e, 'Something went wrong'));
    }
    load();
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
        <Text className="font-serif text-3xl text-ink">List invites</Text>

        {error && <Text className="font-sans text-danger">{error}</Text>}

        {!loading && !error && requests.length === 0 && (
          <Text className="font-serif-italic text-muted">
            No list invites right now. When someone invites you to one of their
            lists, it shows up here to approve or reject.
          </Text>
        )}

        {requests.map((req) => (
          <View
            key={req.id}
            style={cardShadow}
            className="rounded-skin border-skin border-border bg-panel p-4">
            <Text className="font-serif text-lg text-ink" numberOfLines={1}>
              {req.list.icon} {req.list.name}
            </Text>
            <Text className="font-sans text-sm text-muted" numberOfLines={2}>
              {req.list.description || 'No description'}
            </Text>
            <Text className="mt-1 font-sans text-xs text-muted">
              Invited by {atHandle(req.invitedBy.handle)}
            </Text>
            <View className="mt-3 flex-row justify-end gap-3">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Reject invite to ${req.list.name}`}
                onPress={() => decide(req.id, 'reject')}
                hitSlop={6}
                style={TAP_TARGET}
                className="rounded-skin border-skin border-border px-4">
                <Text className="font-sans-semibold text-ink">Reject</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Approve invite to ${req.list.name}`}
                onPress={() => decide(req.id, 'approve')}
                hitSlop={6}
                style={TAP_TARGET}
                className="rounded-skin bg-primary px-4">
                <Text className="font-sans-semibold text-primary-ink">
                  Approve
                </Text>
              </Pressable>
            </View>
          </View>
        ))}
      </Animated.ScrollView>
    </SafeAreaView>
  );
}
