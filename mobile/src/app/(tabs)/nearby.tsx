import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import Mapbox, { Camera, MapView, MarkerView, UserLocation } from '@rnmapbox/maps';
import BottomSheet, {
  BottomSheetFlatList,
  type BottomSheetFlatListMethods,
} from '@gorhom/bottom-sheet';

import { trpc } from '@/client/api';
import FloatingStatusBar from '@/components/floating-status-bar';
import TagPill from '@/components/tag-pill';
import { cardShadow } from '@/theme/shadows';
import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';

type NearbyResult = Awaited<ReturnType<typeof trpc.nearby.find.query>>;
type NearbyItem = Extract<NearbyResult, { ok: true }>['data'][number];

const RANGES = [1, 5, 10, 25];

// The runtime (public, pk.…) token that loads map tiles. Inlined at bundle time;
// see .env.example. Setting null just means tiles won't render — no crash.
Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? null);

/** Fallback readout of a coordinate pair when reverse-geocoding is unavailable. */
const formatCoords = (lat: number, lon: number) =>
  `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;

/** Trim a Mapbox full address for display: drop the country and any trailing
 *  postal code so we show only street / city / region. */
function shortAddress(full: string): string {
  const parts = full
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return full;
  // full_address always ends with the country segment — drop it.
  if (parts.length > 1) parts.pop();
  // Strip a trailing postcode token from the last remaining segment,
  // e.g. "California 94103" -> "California".
  const i = parts.length - 1;
  parts[i] = parts[i].replace(/\s+\S*\d\S*$/, '').trim();
  return parts.filter(Boolean).join(', ');
}

// Roughly one card's height — good enough for scrollToIndex from a pin tap. Cards
// vary a little (tags/no tags), so getItemLayout is approximate but reliable.
const ITEM_HEIGHT = 96;

export default function NearbyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme().theme;
  const t = THEME_TOKENS[theme];
  const isDark = theme.includes('DARK');

  // Null until the user taps a distance — no range starts selected.
  const [radius, setRadius] = useState<number | null>(null);
  const [items, setItems] = useState<NearbyItem[]>([]);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [locationLabel, setLocationLabel] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(
    'Tap a distance to find nearby bookmarks.',
  );
  const [busy, setBusy] = useState(false);
  // Drives the "Open Settings" recovery row: once iOS has recorded a denial, asking again
  // from inside the app is a no-op, so the only way forward is the system settings pane.
  const [permDenied, setPermDenied] = useState(false);
  // Off by default → all bookmarks; on → only those the user hasn't visited.
  const [hideVisited, setHideVisited] = useState(false);
  // Briefly ringed after its pin is tapped, to tie the pin to its list row.
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // Filtered view shared by the map pins and the list so their numbering matches.
  const visibleItems = useMemo(
    () => (hideVisited ? items.filter((it) => !it.card.visited) : items),
    [items, hideVisited],
  );

  const cameraRef = useRef<Camera>(null);
  const sheetRef = useRef<BottomSheet>(null);
  const listRef = useRef<BottomSheetFlatListMethods>(null);
  const snapPoints = useMemo(() => ['45%', '90%'], []);

  // Auto-locate on open: get the user's position (and a readable label) up front so
  // the map centers on them immediately, before any distance is chosen.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status: perm } = await Location.requestForegroundPermissionsAsync();
        if (perm !== 'granted') {
          if (!cancelled) {
            setStatus('Location permission denied.');
            setPermDenied(true);
          }
          return;
        }
        const loc = await Location.getCurrentPositionAsync({});
        if (cancelled) return;
        setPermDenied(false);
        const { latitude: lat, longitude: lon } = loc.coords;
        setCoords({ lat, lon });
        cameraRef.current?.setCamera({
          centerCoordinate: [lon, lat],
          zoomLevel: 12,
          animationDuration: 600,
        });
        const place = await trpc.places.reverseGeocode.query({ lat, lon });
        if (!cancelled)
          setLocationLabel(
            place.ok ? shortAddress(place.data.address) : formatCoords(lat, lon),
          );
      } catch (e) {
        if (!cancelled)
          setStatus(e instanceof Error ? e.message : 'Could not get your location');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fit the camera to the user + every result so all pins are visible at once.
  const fitToResults = useCallback(
    (data: NearbyItem[], center: { lat: number; lon: number }) => {
      if (data.length === 0) {
        cameraRef.current?.setCamera({
          centerCoordinate: [center.lon, center.lat],
          zoomLevel: 12,
          animationDuration: 500,
        });
        return;
      }
      const lats = [center.lat, ...data.map((d) => d.lat)];
      const lons = [center.lon, ...data.map((d) => d.lon)];
      cameraRef.current?.fitBounds(
        [Math.max(...lons), Math.max(...lats)],
        [Math.min(...lons), Math.min(...lats)],
        // Keep pins clear of the floating chips (top) and the drawer (bottom).
        [insets.top + 96, 48, 360, 48],
        600,
      );
    },
    [insets.top],
  );

  async function find(r: number) {
    setRadius(r);
    setBusy(true);
    setStatus(null);
    setItems([]);
    try {
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== 'granted') {
        setStatus('Location permission denied.');
        setPermDenied(true);
        setBusy(false);
        return;
      }
      setPermDenied(false);
      const loc = await Location.getCurrentPositionAsync({});
      const { latitude: lat, longitude: lon } = loc.coords;
      setCoords({ lat, lon });
      const [res, place] = await Promise.all([
        trpc.nearby.find.query({ lat, lon, radiusMiles: r, listIds: [] }),
        trpc.places.reverseGeocode.query({ lat, lon }),
      ]);
      setLocationLabel(
        place.ok ? shortAddress(place.data.address) : formatCoords(lat, lon),
      );
      if (res.ok) {
        setItems(res.data);
        fitToResults(res.data, { lat, lon });
        setStatus(res.data.length === 0 ? `No bookmarks within ${r} mi.` : null);
      } else {
        setStatus(res.error);
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Nearby search failed');
    }
    setBusy(false);
  }

  // Pin tap → expand the drawer, scroll to the matching row, and ring it briefly.
  function focusItem(item: NearbyItem, index: number) {
    setHighlightId(item.card.id);
    sheetRef.current?.snapToIndex(1);
    // Let the sheet expand before scrolling so the row lands in view.
    setTimeout(() => {
      listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.3 });
    }, 250);
  }

  useEffect(() => {
    if (!highlightId) return;
    const timer = setTimeout(() => setHighlightId(null), 1800);
    return () => clearTimeout(timer);
  }, [highlightId]);

  return (
    <View className="flex-1 bg-bg">
      <MapView
        style={StyleSheet.absoluteFill}
        styleURL={isDark ? Mapbox.StyleURL.Dark : Mapbox.StyleURL.Street}
        scaleBarEnabled={false}
        logoPosition={{ top: 8, left: 8 }}
        attributionPosition={{ top: 8, left: 96 }}>
        <Camera ref={cameraRef} />
        {coords && <UserLocation visible />}
        {visibleItems.map((item, index) => {
          const active = highlightId === item.card.id;
          return (
            <MarkerView
              key={`${item.listId}:${item.card.id}`}
              coordinate={[item.lon, item.lat]}
              anchor={{ x: 0.5, y: 1 }}
              allowOverlap>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Map pin ${index + 1}, ${item.card.name}, ${item.distanceMiles.toFixed(1)} miles away`}
                onPress={() => focusItem(item, index)}
                hitSlop={8}>
                <View
                  style={[
                    styles.pin,
                    {
                      backgroundColor: active ? t.accent : t.primary,
                      borderColor: t.panel,
                    },
                  ]}>
                  <Text className="font-sans-semibold text-xs text-primary-ink">
                    {index + 1}
                  </Text>
                </View>
                <View
                  style={[
                    styles.pinTail,
                    { borderTopColor: active ? t.accent : t.primary },
                  ]}
                />
              </Pressable>
            </MarkerView>
          );
        })}
      </MapView>

      {/* Floating distance selector — sits over the map for the "floating" effect. */}
      <View
        pointerEvents="box-none"
        style={[styles.chipsWrap, { top: insets.top + 8 }]}>
        <View
          style={[
            styles.chips,
            {
              backgroundColor: t.panel + (isDark ? 'E6' : 'F2'),
              borderColor: t.border,
            },
          ]}>
          {RANGES.map((r) => {
            const selected = radius === r;
            return (
              <Pressable
                key={r}
                accessibilityRole="button"
                accessibilityLabel={`Search within ${r} miles`}
                accessibilityState={{ selected }}
                onPress={() => find(r)}
                style={[
                  styles.chip,
                  { backgroundColor: selected ? t.primary : 'transparent' },
                ]}>
                <Text
                  className={`font-sans-semibold ${
                    selected ? 'text-primary-ink' : 'text-ink'
                  }`}>
                  {r} mi
                </Text>
              </Pressable>
            );
          })}
        </View>
        {busy && (
          <View style={styles.busyRow}>
            <ActivityIndicator color={t.primary} />
          </View>
        )}
      </View>

      {/* Results drawer — slides up over the bottom half of the map. */}
      <BottomSheet
        ref={sheetRef}
        index={0}
        snapPoints={snapPoints}
        // Stack the drawer above the floating distance chips so that when it's dragged up to
        // full height it covers them; at the resting 45% snap they don't overlap (chips are
        // pinned to the top, the drawer to the bottom), so both stay tappable.
        containerStyle={{ zIndex: 10 }}
        backgroundStyle={{ backgroundColor: t.bg }}
        handleIndicatorStyle={{ backgroundColor: t.muted }}>
        <View className="gap-0.5 px-4 pb-2">
          <View className="flex-row items-center justify-between gap-2">
            <Text className="font-serif text-3xl text-ink" numberOfLines={1}>
              Near me
            </Text>
            <View className="flex-row items-center gap-1.5">
              <Text className="font-sans text-xs text-muted">
                Show only unvisited
              </Text>
              <Switch
                accessibilityLabel="Show only unvisited bookmarks"
                value={hideVisited}
                onValueChange={setHideVisited}
                trackColor={{ true: t.primary, false: `${t.muted}66` }}
                ios_backgroundColor={`${t.muted}66`}
              />
            </View>
          </View>
          {locationLabel && (
            <Text className="font-sans text-sm text-muted" numberOfLines={1}>
              📍 {locationLabel}
            </Text>
          )}
          {status && (
            <Text className="mt-0.5 font-sans text-sm text-muted">{status}</Text>
          )}
          {permDenied && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open Settings to allow location access"
              onPress={() => Linking.openSettings()}
              className="mt-2 self-start rounded-full border-skin border-border bg-panel px-3.5 py-2">
              <Text className="font-sans-semibold text-primary">Open Settings</Text>
            </Pressable>
          )}
        </View>
        <BottomSheetFlatList
          ref={listRef}
          data={visibleItems}
          keyExtractor={(it) => `${it.listId}:${it.card.id}`}
          getItemLayout={(_, index) => ({
            length: ITEM_HEIGHT,
            offset: ITEM_HEIGHT * index,
            index,
          })}
          onScrollToIndexFailed={({ index }) => {
            listRef.current?.scrollToOffset({
              offset: ITEM_HEIGHT * index,
              animated: true,
            });
          }}
          contentContainerStyle={{
            gap: 8,
            paddingTop: 12,
            paddingHorizontal: 16,
            paddingBottom: insets.bottom + 96,
          }}
          renderItem={({ item, index }) => {
            const active = highlightId === item.card.id;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.card.name}, ${item.distanceMiles.toFixed(1)} miles away, in ${item.listLabel.name}`}
                onPress={() =>
                  router.push({
                    pathname: '/bookmarks/[id]',
                    params: { id: item.card.id, name: item.card.name },
                  })
                }
                style={cardShadow}
                className={`gap-1 rounded-skin bg-panel p-3 ${
                  active ? 'border-2 border-accent' : 'border-skin border-border'
                }`}>
                <View className="flex-row items-center justify-between gap-2">
                  <View className="flex-shrink flex-row items-center gap-2">
                    <View style={[styles.cardNum, { backgroundColor: t.primary }]}>
                      <Text className="font-sans-semibold text-xs text-primary-ink">
                        {index + 1}
                      </Text>
                    </View>
                    <Text
                      className="flex-shrink font-sans-semibold text-base text-ink"
                      numberOfLines={1}>
                      {item.card.name}
                    </Text>
                  </View>
                  <Text className="font-sans-semibold text-base text-ink">
                    {item.distanceMiles.toFixed(1)} mi
                  </Text>
                </View>
                <Text className="font-sans text-xs text-muted">
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
            );
          }}
        />
      </BottomSheet>

      <FloatingStatusBar />
    </View>
  );
}

const styles = StyleSheet.create({
  chipsWrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    // Above the map, but below the results drawer (zIndex 10) so a fully-expanded drawer
    // covers the chips rather than the chips floating over it.
    zIndex: 1,
  },
  chips: {
    flexDirection: 'row',
    gap: 6,
    padding: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 999,
  },
  busyRow: {
    alignItems: 'center',
    marginTop: 10,
  },
  pin: {
    minWidth: 26,
    height: 26,
    paddingHorizontal: 6,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinTail: {
    alignSelf: 'center',
    width: 0,
    height: 0,
    marginTop: -2,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  // Matches the map pin's circle so a result row reads as the same marker.
  cardNum: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 5,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
