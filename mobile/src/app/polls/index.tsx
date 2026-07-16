import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useHeaderHeight } from '@react-navigation/elements';

import { trpc } from '@/client/api';
import PollRow from '@/components/poll-row';
import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';

type Polls = Awaited<ReturnType<typeof trpc.polls.forList.query>>;

export default function PollListScreen() {
  const router = useRouter();
  const { listId, listName } = useLocalSearchParams<{
    listId: string;
    listName?: string;
  }>();
  const t = THEME_TOKENS[useTheme().theme];
  const headerHeight = useHeaderHeight();

  const [polls, setPolls] = useState<Polls>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!listId) return;
    setError(null);
    trpc.polls.forList
      .query({ listId })
      .then(setPolls)
      .catch((e) => setError(e instanceof Error ? e.message : 'Request failed'))
      .finally(() => setLoading(false));
    trpc.lists.get
      .query({ listId })
      .then((m) => setCanCreate(m?.role === 'OWNER' || m?.role === 'COLLABORATOR'))
      .catch(() => {});
  }, [listId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load]),
  );

  return (
    <View className="flex-1 bg-bg">
      <Stack.Screen options={{ headerTitle: '' }} />

      <FlatList
        data={polls}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{
          padding: 16,
          paddingTop: headerHeight + 8,
          gap: 12,
          paddingBottom: 24,
        }}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={load}
            tintColor={t.muted}
            progressViewOffset={headerHeight}
          />
        }
        ListHeaderComponent={
          <View className="gap-3">
            <Text className="font-serif text-3xl text-ink">Polls</Text>
            {canCreate && (
              <Pressable
                onPress={() =>
                  router.push({ pathname: '/polls/new', params: { listId, listName } })
                }
                className="items-center rounded-skin bg-primary py-3">
                <Text className="font-sans-semibold text-primary-ink">
                  Create poll
                </Text>
              </Pressable>
            )}
          </View>
        }
        ListEmptyComponent={
          loading ? null : error ? (
            <Text className="font-sans text-danger">{error}</Text>
          ) : (
            <Text className="mt-6 text-center font-serif-italic text-muted">
              No polls yet.
            </Text>
          )
        }
        renderItem={({ item }) => (
          <PollRow
            poll={item}
            onPress={() =>
              router.push({ pathname: '/polls/[pollId]', params: { pollId: item.id } })
            }
          />
        )}
      />
    </View>
  );
}
