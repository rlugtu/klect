import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { useFocusEffect } from 'expo-router';

import { trpc } from '@/client/api';
import { toast, errorMessage } from '@/client/toast';
import { atHandle } from '@/lib/handle';
import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';

type Blocked = Awaited<ReturnType<typeof trpc.moderation.blockedList.query>>;

/**
 * Manage the users you've blocked — list + one-tap unblock. Reached from Settings →
 * Safety & privacy → Blocked users. Unblocking restores the other user's ability to
 * message/friend you and un-hides their content.
 */
export default function BlockedScreen() {
  const { theme } = useTheme();
  const t = THEME_TOKENS[theme];
  const headerHeight = useHeaderHeight();

  const [rows, setRows] = useState<Blocked>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    trpc.moderation.blockedList
      .query()
      .then(setRows)
      .catch((e) => toast.error(errorMessage(e, 'Could not load blocked users.')))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => load(), [load]));

  async function unblock(userId: string) {
    setPendingId(userId);
    try {
      await trpc.moderation.unblock.mutate({ userId });
      setRows((cur) => cur.filter((r) => r.user.id !== userId));
      toast.success('User unblocked.');
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't unblock."));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['left', 'right']} className="bg-bg">
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingTop: headerHeight + 8,
          paddingBottom: 40,
          gap: 16,
        }}>
        <Text className="font-serif text-3xl text-ink">Blocked users</Text>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 24 }} />
        ) : rows.length === 0 ? (
          <Text className="font-serif-italic text-muted">
            You haven’t blocked anyone.
          </Text>
        ) : (
          <View className="gap-2">
            {rows.map((r) => (
              <View
                key={r.blockId}
                className="flex-row items-center justify-between rounded-skin border-skin border-border bg-panel p-3">
                <View className="flex-row items-center gap-2">
                  <Text style={{ fontSize: 20 }}>{r.user.icon ?? '🙂'}</Text>
                  <Text className="font-sans text-base text-ink">
                    {atHandle(r.user.handle)}
                  </Text>
                </View>
                <Pressable
                  disabled={pendingId === r.user.id}
                  onPress={() => unblock(r.user.id)}
                  className="rounded-skin border-skin border-border px-3 py-2">
                  {pendingId === r.user.id ? (
                    <ActivityIndicator color={t.ink} size="small" />
                  ) : (
                    <Text className="font-sans-semibold text-ink">Unblock</Text>
                  )}
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
