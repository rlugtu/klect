import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';

import { trpc } from '@/client/api';
import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';
import PhotoCard from '@/components/photo-card';

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
      <FlatList
        data={shown}
        keyExtractor={(m) => m.list.id}
        contentContainerStyle={{ padding: 16, gap: 16 }}
        ListHeaderComponent={
          <View className="gap-3 pb-1">
            <View className="flex-row items-center justify-between">
              <Text className="font-serif text-3xl text-ink">Saive</Text>
              <Pressable onPress={() => router.push('/lists/new')}>
                <Text className="font-sans-semibold text-base text-primary">
                  + New
                </Text>
              </Pressable>
            </View>

            <TextInput
              className="rounded-skin border-skin border-border px-4 py-2.5 font-sans text-ink"
              placeholder="Search lists"
              placeholderTextColor={muted}
              autoCapitalize="none"
              value={query}
              onChangeText={setQuery}
            />

            {loading && <Text className="font-sans text-muted">Loading…</Text>}
            {error && (
              <Text className="font-sans text-danger">Not signed in — {error}</Text>
            )}
            {!loading && !error && shown.length === 0 && (
              <Text className="font-serif-italic text-muted">
                {query ? 'No lists match.' : 'No lists yet — tap + New.'}
              </Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <PhotoCard
            placeholderEmoji={item.list.icon}
            onPress={() =>
              router.push({
                pathname: '/lists/[id]',
                params: { id: item.list.id, name: item.list.name },
              })
            }>
            <Text className="font-serif text-xl text-ink">{item.list.name}</Text>
            <Text className="font-sans text-sm text-muted">
              {item.list._count.bookmarks} bookmarks
            </Text>
          </PhotoCard>
        )}
      />
    </SafeAreaView>
  );
}
