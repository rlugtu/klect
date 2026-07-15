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
type Outgoing = FriendsData['outgoing'];

const displayName = (u: {
  displayName: string | null;
  name: string | null;
  email: string;
}) => u.displayName ?? u.name ?? u.email;

/** Friend requests the user has sent, awaiting acceptance. Withdraw with Cancel. */
export default function PendingRequestsScreen() {
  const headerHeight = useHeaderHeight();
  const [outgoing, setOutgoing] = useState<Outgoing>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    trpc.friends.list
      .query()
      .then((d) => setOutgoing(d.outgoing))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => load(), [load]));

  async function cancel(id: string) {
    setOutgoing((cur) => cur.filter((r) => r.id !== id));
    await trpc.friends.cancel.mutate({ id });
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
        <Text className="font-serif text-3xl text-ink">Pending requests</Text>

        {!loading && outgoing.length === 0 && (
          <Text className="font-serif-italic text-muted">
            No pending requests. Requests you send appear here until they&apos;re
            accepted.
          </Text>
        )}

        {outgoing.map((req) => (
          <View
            key={req.id}
            style={cardShadow}
            className="flex-row items-center justify-between rounded-skin border-skin border-border bg-panel p-4">
            <View className="flex-1 pr-2">
              <Text className="font-sans-medium text-base text-ink">
                {req.addressee.icon ? `${req.addressee.icon} ` : ''}
                {displayName(req.addressee)}
              </Text>
              <Text className="text-xs text-muted">{req.addressee.email}</Text>
              <Text className="mt-1 text-xs text-muted">Pending</Text>
            </View>
            <Pressable onPress={() => cancel(req.id)} hitSlop={8}>
              <Text className="font-sans text-danger">Cancel</Text>
            </Pressable>
          </View>
        ))}
      </Animated.ScrollView>
      <FloatingStatusBar />
    </SafeAreaView>
  );
}
