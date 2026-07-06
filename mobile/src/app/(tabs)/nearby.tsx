import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';

import { trpc } from '@/client/api';

type NearbyResult = Awaited<ReturnType<typeof trpc.nearby.find.query>>;
type NearbyItem = Extract<NearbyResult, { ok: true }>['data'][number];

const RANGES = [1, 5, 10, 25];

export default function NearbyScreen() {
  const router = useRouter();
  const [radius, setRadius] = useState(5);
  const [items, setItems] = useState<NearbyItem[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [status, setStatus] = useState<string | null>(
    'Pick a radius to search near you.',
  );
  const [busy, setBusy] = useState(false);

  async function find(r: number) {
    setRadius(r);
    setBusy(true);
    setStatus(null);
    try {
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== 'granted') {
        setStatus('Location permission denied.');
        setBusy(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      const res = await trpc.nearby.find.query({
        lat: loc.coords.latitude,
        lon: loc.coords.longitude,
        radiusMiles: r,
        listIds: [],
      });
      if (res.ok) {
        setItems(res.data);
        setSkipped(res.skipped);
        if (res.data.length === 0) setStatus(`No bookmarks within ${r} mi.`);
      } else {
        setStatus(res.error);
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Nearby search failed');
    }
    setBusy(false);
  }

  return (
    <SafeAreaView style={{ flex: 1 }} className="bg-bg">
      <View className="flex-1 gap-3 px-4 pt-4">
        <Text className="text-2xl font-bold text-ink">Near me</Text>

        <View className="flex-row gap-2">
          {RANGES.map((r) => (
            <Pressable
              key={r}
              onPress={() => find(r)}
              className={`rounded-lg border px-3 py-2 ${
                radius === r ? 'border-primary bg-primary' : 'border-border'
              }`}>
              <Text className={radius === r ? 'text-primary-ink' : 'text-ink'}>
                {r} mi
              </Text>
            </Pressable>
          ))}
        </View>

        {busy && <ActivityIndicator />}
        {status && <Text className="text-muted">{status}</Text>}
        {skipped > 0 && (
          <Text className="text-xs text-muted">
            {skipped} skipped (no coordinates)
          </Text>
        )}

        <FlatList
          data={items}
          keyExtractor={(it) => `${it.listId}:${it.card.id}`}
          contentContainerStyle={{ gap: 8 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/bookmarks/[id]',
                  params: { id: item.card.id, name: item.card.name },
                })
              }
              className="gap-1 rounded-xl border border-border bg-panel p-3">
              <View className="flex-row items-center justify-between">
                <Text className="flex-1 pr-2 text-base font-semibold text-ink">
                  {item.card.name}
                </Text>
                <Text className="text-xs text-muted">
                  {item.distanceMiles.toFixed(1)} mi
                </Text>
              </View>
              <Text className="text-xs text-muted">
                {item.listLabel.icon} {item.listLabel.name}
              </Text>
            </Pressable>
          )}
        />
      </View>
    </SafeAreaView>
  );
}
