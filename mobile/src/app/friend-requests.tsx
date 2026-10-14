import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { Stack, useFocusEffect } from 'expo-router';
import { useHeaderHeight } from '@react-navigation/elements';

import { trpc } from '@/client/api';
import { toast, errorMessage } from '@/client/toast';
import { atHandle } from '@/lib/handle';
import FloatingStatusBar from '@/components/floating-status-bar';
import { cardShadow } from '@/theme/shadows';

type FriendsData = Awaited<ReturnType<typeof trpc.friends.list.query>>;
type Incoming = FriendsData['incoming'];

// Text-only rows can't reach Apple's 44pt minimum from padding alone.
const TAP_TARGET = { minHeight: 44, justifyContent: 'center' } as const;

/** All incoming friend requests: accept or decline. Pushed from the Friends tab. */
export default function FriendRequestsScreen() {
  const headerHeight = useHeaderHeight();
  const [incoming, setIncoming] = useState<Incoming>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    trpc.friends.list
      .query()
      .then((d) => {
        setIncoming(d.incoming);
        setError(null);
      })
      .catch((e) => setError(errorMessage(e, 'Could not load friend requests')))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => load(), [load]));

  async function decide(id: string, decision: 'accept' | 'decline') {
    setIncoming((cur) => cur.filter((r) => r.id !== id));
    try {
      if (decision === 'accept') await trpc.friends.accept.mutate({ id });
      else await trpc.friends.decline.mutate({ id });
      toast.success(decision === 'accept' ? 'Friend added' : 'Request declined');
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
        <Text className="font-serif text-3xl text-ink">Friend requests</Text>

        {error && <Text className="font-sans text-danger">{error}</Text>}

        {!loading && !error && incoming.length === 0 && (
          <Text className="font-serif-italic text-muted">
            No friend requests right now. When someone sends you a friend
            request, it shows up here to accept or decline.
          </Text>
        )}

        {incoming.map((req) => (
          <View
            key={req.id}
            style={cardShadow}
            className="flex-row items-center justify-between rounded-skin border-skin border-border bg-panel p-4">
            <View className="flex-1 pr-2">
              <Text className="font-sans-medium text-base text-ink">
                {req.requester.icon ? `${req.requester.icon} ` : ''}
                {atHandle(req.requester.handle)}
              </Text>
            </View>
            <View className="flex-row items-center gap-2">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Decline friend request from ${atHandle(req.requester.handle)}`}
                onPress={() => decide(req.id, 'decline')}
                hitSlop={6}
                style={TAP_TARGET}
                className="rounded-skin border-skin border-border px-3">
                <Text className="font-sans-semibold text-ink">Decline</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Accept friend request from ${atHandle(req.requester.handle)}`}
                onPress={() => decide(req.id, 'accept')}
                hitSlop={6}
                style={TAP_TARGET}
                className="rounded-skin bg-primary px-3">
                <Text className="font-sans-semibold text-primary-ink">
                  Accept
                </Text>
              </Pressable>
            </View>
          </View>
        ))}
      </Animated.ScrollView>
      <FloatingStatusBar />
    </SafeAreaView>
  );
}
