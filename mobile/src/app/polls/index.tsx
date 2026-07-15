import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useHeaderHeight } from '@react-navigation/elements';

import { trpc } from '@/client/api';
import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';

type Polls = Awaited<ReturnType<typeof trpc.polls.forList.query>>;

/** Relative status label derived from the poll's start/end (ISO strings over the
 *  wire — the tRPC client has no date transformer). */
function pollStatus(startAt: string, endAt: string | null): string {
  const now = Date.now();
  const start = new Date(startAt).getTime();
  const end = endAt ? new Date(endAt).getTime() : null;
  if (now < start) return 'Scheduled';
  if (end != null && now >= end) return 'Ended';
  if (end == null) return 'Active';
  const mins = Math.round((end - now) / 60000);
  if (mins < 60) return `Ends in ${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `Ends in ${hrs}h`;
  return `Ends in ${Math.round(hrs / 24)}d`;
}

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
        renderItem={({ item }) => {
          const creator = item.creator.displayName ?? item.creator.name ?? 'Someone';
          return (
            <Pressable
              onPress={() =>
                router.push({ pathname: '/polls/[pollId]', params: { pollId: item.id } })
              }
              className="rounded-skin border-skin border-border bg-panel p-4">
              <Text className="font-serif text-lg text-ink">{item.name}</Text>
              <View className="mt-1 flex-row items-center justify-between">
                <Text className="font-sans text-sm text-muted">
                  {item.creator.icon ? `${item.creator.icon} ` : ''}
                  {creator} · {item._count.options} options
                </Text>
                <Text className="font-sans-medium text-xs text-primary">
                  {pollStatus(item.startAt, item.endAt)}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
