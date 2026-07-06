import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';

import { trpc } from '@/client/api';
import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';

// Inferred straight from web's tRPC procedure — no hand-written DTOs.
type Memberships = Awaited<ReturnType<typeof trpc.lists.mine.query>>;

export default function HomeScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const muted = THEME_TOKENS[theme].muted;

  const [lists, setLists] = useState<Memberships>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Refetch on focus so a newly created/edited/deleted list is reflected.
  useFocusEffect(
    useCallback(() => {
      trpc.lists.mine
        .query()
        .then(setLists)
        .catch((e) => setError(e instanceof Error ? e.message : 'Request failed'))
        .finally(() => setLoading(false));
    }, []),
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return lists;
    return lists.filter((m) => m.list.name.toLowerCase().includes(q));
  }, [lists, query]);

  return (
    <SafeAreaView style={{ flex: 1 }} className="bg-bg">
      <View className="flex-1 gap-3 px-4 pt-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-2xl font-bold text-ink">Saive</Text>
          <Pressable onPress={() => router.push('/lists/new')}>
            <Text className="text-base font-semibold text-primary">+ New</Text>
          </Pressable>
        </View>

        <TextInput
          className="rounded-skin border-skin border-border px-4 py-2 text-ink"
          placeholder="Search lists"
          placeholderTextColor={muted}
          autoCapitalize="none"
          value={query}
          onChangeText={setQuery}
        />

        {loading && <Text className="text-muted">Loading…</Text>}
        {error && <Text className="text-danger">Not signed in — {error}</Text>}
        {!loading && !error && shown.length === 0 && (
          <Text className="text-muted">
            {query ? 'No lists match.' : 'No lists yet — tap + New.'}
          </Text>
        )}

        <FlatList
          data={shown}
          keyExtractor={(m) => m.list.id}
          contentContainerStyle={{ gap: 8 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/lists/[id]',
                  params: { id: item.list.id, name: item.list.name },
                })
              }
              className="rounded-skin border-skin border-border bg-panel p-3">
              <Text className="text-base text-ink">
                {item.list.icon} {item.list.name}
              </Text>
              <Text className="text-sm text-muted">
                {item.list._count.bookmarks} bookmarks
              </Text>
            </Pressable>
          )}
        />
      </View>
    </SafeAreaView>
  );
}
