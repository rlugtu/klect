import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';

import { trpc } from '@/client/api';
import { subscribeDm, realtimeEnabled } from '@/client/realtime';
import { atHandle } from '@/lib/handle';
import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';
import { cardShadow } from '@/theme/shadows';
import { useTabBarScrollHandler } from '@/theme/tab-bar-scroll';

type Conversations = Awaited<ReturnType<typeof trpc.dms.conversations.query>>;
type Conversation = Conversations[number];

/** Compact relative time (mirrors the friends/comments formatting). */
function timeAgo(value: Date | string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (s < 60) return 'now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(value).toLocaleDateString();
}

/**
 * The DMs view rendered inside the Friends tab. Lists conversations (unread dot + preview),
 * refreshes live off the user's realtime channel (polling fallback), lets the user delete a
 * chat, and opens a thread. `header` is the shared Friends|DMs segmented control so it scrolls
 * with the list. `onCounts` reports the unread total up to the tab badge.
 */
export function DmInbox({
  myId,
  header,
  onScroll,
  onCounts,
}: {
  myId: string;
  header: React.ReactElement;
  onScroll: ReturnType<typeof useTabBarScrollHandler>;
  onCounts: (unread: number) => void;
}) {
  const { theme } = useTheme();
  const t = THEME_TOKENS[theme];
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    trpc.dms.conversations
      .query()
      .then((c) => {
        setConvos(c);
        onCounts(c.filter((x) => x.unread).length);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [onCounts]);

  useFocusEffect(useCallback(() => load(), [load]));

  useEffect(() => {
    const unsub = subscribeDm(`dm:user:${myId}`, load);
    const id = setInterval(load, realtimeEnabled() ? 20000 : 5000);
    return () => {
      unsub();
      clearInterval(id);
    };
  }, [myId, load]);

  function confirmDelete(conversationId: string) {
    Alert.alert('Delete chat?', 'This clears it from your inbox only.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setConvos((cur) => cur.filter((c) => c.conversationId !== conversationId));
          await trpc.dms.clear.mutate({ conversationId });
          load();
        },
      },
    ]);
  }

  return (
    <Animated.FlatList
      onScroll={onScroll}
      scrollEventThrottle={16}
      data={convos}
      keyExtractor={(c) => c.conversationId}
      ListHeaderComponent={
        <View className="gap-4">
          {header}
          <Pressable
            onPress={() => router.push('/dm/new')}
            className="flex-row items-center justify-center gap-2 self-end rounded-skin bg-primary px-4 py-2.5">
            <Ionicons name="create-outline" size={16} color={t.primaryInk} />
            <Text className="font-sans-semibold text-primary-ink">New chat</Text>
          </Pressable>
          {loaded && convos.length === 0 && (
            <Text className="font-serif-italic text-muted">
              No conversations yet — start one with a friend.
            </Text>
          )}
        </View>
      }
      contentContainerStyle={{
        padding: 16,
        paddingTop: insets.top + 16,
        paddingBottom: 120,
        gap: 10,
      }}
      renderItem={({ item }) => {
        const mine = item.lastMessage.senderId !== item.other.id;
        return (
          <Pressable
            style={cardShadow}
            onPress={() =>
              router.push({
                pathname: '/dm/[conversationId]',
                params: {
                  conversationId: item.conversationId,
                  handle: atHandle(item.other.handle),
                },
              })
            }
            onLongPress={() => confirmDelete(item.conversationId)}
            className="flex-row items-center gap-3 rounded-skin border-skin border-border bg-panel p-3">
            {item.unread ? (
              <View className="size-2.5 rounded-full bg-danger" />
            ) : (
              <View className="size-2.5" />
            )}
            <Text className="text-lg">{item.other.icon ?? '🔖'}</Text>
            <View className="flex-1">
              <View className="flex-row items-center justify-between">
                <Text className="font-sans-semibold text-ink" numberOfLines={1}>
                  {atHandle(item.other.handle)}
                </Text>
                <Text className="text-xs text-muted">{timeAgo(item.lastMessageAt)}</Text>
              </View>
              <Text
                className={item.unread ? 'text-sm text-ink' : 'text-sm text-muted'}
                numberOfLines={1}>
                {mine ? 'You: ' : ''}
                {item.lastMessage.type === 'BOOKMARK'
                  ? item.lastMessage.body || 'Shared a bookmark'
                  : item.lastMessage.body}
              </Text>
            </View>
            <Pressable hitSlop={8} onPress={() => confirmDelete(item.conversationId)}>
              <Ionicons name="trash-outline" size={18} color={t.muted} />
            </Pressable>
          </Pressable>
        );
      }}
    />
  );
}
