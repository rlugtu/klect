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
type Outgoing = FriendsData['outgoing'];

/** Friend requests the user has sent, awaiting acceptance. Withdraw with Cancel. */
export default function PendingRequestsScreen() {
  const headerHeight = useHeaderHeight();
  const [outgoing, setOutgoing] = useState<Outgoing>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    trpc.friends.list
      .query()
      .then((d) => {
        setOutgoing(d.outgoing);
        setError(null);
      })
      .catch((e) => setError(errorMessage(e, 'Could not load sent requests')))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => load(), [load]));

  async function cancel(id: string) {
    // Optimistic removal, restored from the pre-cancel rows if the mutation fails
    // (a re-fetch can't be trusted to recover it when the network is what broke).
    const before = outgoing;
    setOutgoing((cur) => cur.filter((r) => r.id !== id));
    try {
      await trpc.friends.cancel.mutate({ id });
      load();
    } catch (e) {
      setOutgoing(before);
      toast.error(errorMessage(e, 'Could not cancel request'));
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
        <Text className="font-serif text-3xl text-ink">Sent requests</Text>

        {error && <Text className="font-sans text-danger">{error}</Text>}

        {!loading && !error && outgoing.length === 0 && (
          <Text className="font-serif-italic text-muted">
            No sent requests. Friend requests you send appear here until the
            other person accepts them.
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
                {atHandle(req.addressee.handle)}
              </Text>
              <Text className="mt-1 text-xs text-muted">Awaiting response</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Cancel friend request to ${atHandle(req.addressee.handle)}`}
              onPress={() => cancel(req.id)}
              hitSlop={8}>
              <Text className="font-sans text-danger">Cancel</Text>
            </Pressable>
          </View>
        ))}
      </Animated.ScrollView>
      <FloatingStatusBar />
    </SafeAreaView>
  );
}
