import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { Stack, useFocusEffect } from 'expo-router';

import { trpc } from '@/client/api';
import { cardShadow } from '@/theme/shadows';

type Requests = Awaited<ReturnType<typeof trpc.sharing.incomingRequests.query>>;

/** All open list-join (collab) requests addressed to the user: approve or reject. */
export default function RequestsScreen() {
  const [requests, setRequests] = useState<Requests>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    trpc.sharing.incomingRequests
      .query()
      .then(setRequests)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => load(), [load]));

  async function decide(inviteId: string, decision: 'approve' | 'reject') {
    setRequests((cur) => cur.filter((r) => r.id !== inviteId));
    if (decision === 'approve') {
      await trpc.sharing.approveRequest.mutate({ inviteId });
    } else {
      await trpc.sharing.rejectRequest.mutate({ inviteId });
    }
    load();
  }

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['left', 'right']} className="bg-bg">
      <Stack.Screen options={{ title: 'List requests' }} />
      <Animated.ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        {!loading && requests.length === 0 && (
          <Text className="font-serif-italic text-muted">
            No open list requests. When someone invites you to a list, it shows
            up here to approve or reject.
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
            <View className="mt-3 flex-row justify-end gap-5">
              <Pressable onPress={() => decide(req.id, 'reject')} hitSlop={8}>
                <Text className="font-sans text-muted">Reject</Text>
              </Pressable>
              <Pressable onPress={() => decide(req.id, 'approve')} hitSlop={8}>
                <Text className="font-sans-semibold text-primary">Approve</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </Animated.ScrollView>
    </SafeAreaView>
  );
}
