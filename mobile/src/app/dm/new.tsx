import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useHeaderHeight } from '@react-navigation/elements';

import { trpc } from '@/client/api';
import { atHandle } from '@/lib/handle';
import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';
import { cardShadow } from '@/theme/shadows';

type FriendsData = Awaited<ReturnType<typeof trpc.friends.list.query>>;
type Friend = FriendsData['friends'][number];

/** Pick a friend to open (or resume) a 1:1 chat, then jump into the thread. */
export default function NewChatScreen() {
  const { theme } = useTheme();
  const t = THEME_TOKENS[theme];
  const headerHeight = useHeaderHeight();
  const router = useRouter();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      setError(null);
      trpc.friends.list
        .query()
        .then((d) => setFriends(d.friends))
        .catch((e) => setError(e instanceof Error ? e.message : 'Could not load friends.'))
        .finally(() => setLoaded(true));
    }, []),
  );

  async function open(friend: Friend) {
    if (busyId) return;
    setBusyId(friend.friend.id);
    try {
      const { conversationId } = await trpc.dms.start.mutate({
        userId: friend.friend.id,
      });
      router.replace({
        pathname: '/dm/[conversationId]',
        params: { conversationId, handle: atHandle(friend.friend.handle) },
      });
    } catch {
      setBusyId(null);
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
          gap: 10,
        }}>
        <Text className="font-serif text-3xl text-ink">New chat</Text>

        {loaded &&
          friends.length === 0 &&
          (error ? (
            <Text className="font-sans text-danger">{error}</Text>
          ) : (
            <Text className="font-serif-italic text-muted">
              You have no friends to message yet — add some on the Friends tab.
            </Text>
          ))}

        {friends.map((f) => (
          <Pressable
            key={f.friendshipId}
            accessibilityRole="button"
            accessibilityLabel={`Message ${atHandle(f.friend.handle)}`}
            style={cardShadow}
            disabled={busyId !== null}
            onPress={() => open(f)}
            className="flex-row items-center gap-3 rounded-skin border-skin border-border bg-panel p-4">
            <Text className="text-lg">{f.friend.icon ?? '🔖'}</Text>
            <Text className="flex-1 font-sans-medium text-base text-ink" numberOfLines={1}>
              {atHandle(f.friend.handle)}
            </Text>
            {busyId === f.friend.id && <ActivityIndicator color={t.primary} />}
          </Pressable>
        ))}
      </Animated.ScrollView>
    </SafeAreaView>
  );
}
