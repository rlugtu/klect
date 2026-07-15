import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { Stack, useFocusEffect } from 'expo-router';
import { useHeaderHeight } from '@react-navigation/elements';

import { trpc } from '@/client/api';
import FloatingStatusBar from '@/components/floating-status-bar';
import { cardShadow } from '@/theme/shadows';

type FriendsData = Awaited<ReturnType<typeof trpc.friends.list.query>>;
type Incoming = FriendsData['incoming'];

const displayName = (u: {
  displayName: string | null;
  name: string | null;
  email: string;
}) => u.displayName ?? u.name ?? u.email;

/** All incoming friend requests: accept or decline. Pushed from the Friends tab. */
export default function FriendRequestsScreen() {
  const headerHeight = useHeaderHeight();
  const [incoming, setIncoming] = useState<Incoming>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    trpc.friends.list
      .query()
      .then((d) => setIncoming(d.incoming))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => load(), [load]));

  async function decide(id: string, decision: 'accept' | 'decline') {
    setIncoming((cur) => cur.filter((r) => r.id !== id));
    if (decision === 'accept') await trpc.friends.accept.mutate({ id });
    else await trpc.friends.decline.mutate({ id });
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

        {!loading && incoming.length === 0 && (
          <Text className="font-serif-italic text-muted">
            No pending friend requests. When someone adds you, it shows up here
            to accept or decline.
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
                {displayName(req.requester)}
              </Text>
              <Text className="text-xs text-muted">{req.requester.email}</Text>
            </View>
            <View className="flex-row items-center gap-4">
              <Pressable onPress={() => decide(req.id, 'decline')} hitSlop={8}>
                <Text className="font-sans text-muted">Decline</Text>
              </Pressable>
              <Pressable onPress={() => decide(req.id, 'accept')} hitSlop={8}>
                <Text className="font-sans-semibold text-primary">Accept</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </Animated.ScrollView>
      <FloatingStatusBar />
    </SafeAreaView>
  );
}
