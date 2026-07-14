import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';

import { trpc } from '@/client/api';
import FloatingStatusBar from '@/components/floating-status-bar';
import TagPill from '@/components/tag-pill';
import { useTabBarScrollHandler } from '@/theme/tab-bar-scroll';

type NearbyResult = Awaited<ReturnType<typeof trpc.nearby.find.query>>;
type NearbyItem = Extract<NearbyResult, { ok: true }>['data'][number];

const RANGES = [1, 5, 10, 25];

/** Fallback readout of a coordinate pair when reverse-geocoding is unavailable. */
const formatCoords = (lat: number, lon: number) =>
  `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;

export default function NearbyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const onScroll = useTabBarScrollHandler();
  // Null until the user taps a distance — so no button starts selected and the
  // placeholder below prompts them to pick one.
  const [radius, setRadius] = useState<number | null>(null);
  const [items, setItems] = useState<NearbyItem[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [locationLabel, setLocationLabel] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(
    'Tap a distance to find nearby bookmarks.',
  );
  const [busy, setBusy] = useState(false);

  async function find(r: number) {
    setRadius(r);
    setBusy(true);
    setStatus(null);
    setItems([]);
    setLocationLabel(null);
    try {
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== 'granted') {
        setStatus('Location permission denied.');
        setBusy(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      const { latitude: lat, longitude: lon } = loc.coords;
      // Resolve a readable address alongside the search so it adds no serial latency.
      const [res, place] = await Promise.all([
        trpc.nearby.find.query({ lat, lon, radiusMiles: r, listIds: [] }),
        trpc.places.reverseGeocode.query({ lat, lon }),
      ]);
      setLocationLabel(place.ok ? place.data.address : formatCoords(lat, lon));
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
    <SafeAreaView style={{ flex: 1 }} edges={['left', 'right']} className="bg-bg">
      <View
        className="flex-1 gap-3 px-4"
        style={{ paddingTop: insets.top + 16 }}>
        <Text className="text-2xl font-bold text-ink">Near me</Text>

        <View className="flex-row gap-2">
          {RANGES.map((r) => (
            <Pressable
              key={r}
              onPress={() => find(r)}
              className={`flex-1 items-center rounded-skin border py-3 ${
                radius === r ? 'border-primary bg-primary' : 'border-border'
              }`}>
              <Text className={radius === r ? 'text-primary-ink' : 'text-ink'}>
                {r} mi
              </Text>
            </Pressable>
          ))}
        </View>

        {busy && <ActivityIndicator />}

        {locationLabel && (
          <View className="flex-row items-start gap-2 rounded-skin border-skin border-border bg-panel px-3 py-2.5">
            <Text className="text-lg leading-none">📍</Text>
            <View className="flex-1">
              <Text className="text-xs font-semibold text-muted">Your location</Text>
              <Text className="text-sm text-ink">{locationLabel}</Text>
            </View>
          </View>
        )}

        {status && <Text className="text-muted">{status}</Text>}
        {skipped > 0 && (
          <Text className="text-xs text-muted">
            {skipped} skipped (no coordinates)
          </Text>
        )}

        <Animated.FlatList
          data={items}
          keyExtractor={(it) => `${it.listId}:${it.card.id}`}
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{ gap: 8, paddingBottom: 120 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/bookmarks/[id]',
                  params: { id: item.card.id, name: item.card.name },
                })
              }
              className="gap-1 rounded-skin border-skin border-border bg-panel p-3">
              <View className="flex-row items-center justify-between">
                <Text className="flex-1 pr-2 text-base font-semibold text-ink">
                  {item.card.name}
                </Text>
                <Text className="text-base font-semibold text-ink">
                  {item.distanceMiles.toFixed(1)} mi
                </Text>
              </View>
              <Text className="text-xs text-muted">
                {item.listLabel.icon} {item.listLabel.name}
              </Text>
              {item.card.tags.length > 0 && (
                <View className="flex-row flex-wrap gap-1">
                  {item.card.tags.slice(0, 3).map((tag) => (
                    <TagPill key={tag.id} name={tag.name} color={tag.color} />
                  ))}
                </View>
              )}
            </Pressable>
          )}
        />
      </View>
      <FloatingStatusBar />
    </SafeAreaView>
  );
}
