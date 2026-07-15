import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
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
  const [skipped, setSkipped] = useState(0);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [locationLabel, setLocationLabel] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(
    'Tap a distance to find nearby bookmarks.',
  );
  const [busy, setBusy] = useState(false);
  // Briefly ringed after its pin is tapped, to tie the pin to its list row.
  const [highlightId, setHighlightId] = useState<string | null>(null);

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
          if (!cancelled) setStatus('Location permission denied.');
          return;
        }
        const loc = await Location.getCurrentPositionAsync({});
        if (cancelled) return;
        const { latitude: lat, longitude: lon } = loc.coords;
        setCoords({ lat, lon });
        cameraRef.current?.setCamera({
          centerCoordinate: [lon, lat],
          zoomLevel: 12,
          animationDuration: 600,
        });
        const place = await trpc.places.reverseGeocode.query({ lat, lon });
        if (!cancelled)
          setLocationLabel(place.ok ? place.data.address : formatCoords(lat, lon));
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
        setBusy(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      const { latitude: lat, longitude: lon } = loc.coords;
      setCoords({ lat, lon });
      const [res, place] = await Promise.all([
        trpc.nearby.find.query({ lat, lon, radiusMiles: r, listIds: [] }),
        trpc.places.reverseGeocode.query({ lat, lon }),
      ]);
      setLocationLabel(place.ok ? place.data.address : formatCoords(lat, lon));
      if (res.ok) {
        setItems(res.data);
        setSkipped(res.skipped);
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
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <MapView
        style={StyleSheet.absoluteFill}
        styleURL={isDark ? Mapbox.StyleURL.Dark : Mapbox.StyleURL.Street}
        scaleBarEnabled={false}
        logoPosition={{ top: 8, left: 8 }}
        attributionPosition={{ top: 8, left: 96 }}>
        <Camera ref={cameraRef} />
        {coords && <UserLocation visible />}
        {items.map((item, index) => {
          const active = highlightId === item.card.id;
          return (
            <MarkerView
              key={`${item.listId}:${item.card.id}`}
              coordinate={[item.lon, item.lat]}
              anchor={{ x: 0.5, y: 1 }}
              allowOverlap>
              <Pressable onPress={() => focusItem(item, index)} hitSlop={8}>
                <View
                  style={[
                    styles.pin,
                    {
                      backgroundColor: active ? t.accent : t.primary,
                      borderColor: t.panel,
                    },
                  ]}>
                  <Text style={[styles.pinLabel, { color: t.primaryInk }]}>
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
                onPress={() => find(r)}
                style={[
                  styles.chip,
                  { backgroundColor: selected ? t.primary : 'transparent' },
                ]}>
                <Text
                  style={{
                    color: selected ? t.primaryInk : t.ink,
                    fontWeight: '600',
                  }}>
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
        backgroundStyle={{ backgroundColor: t.panel }}
        handleIndicatorStyle={{ backgroundColor: t.muted }}>
        <View style={styles.sheetHeader}>
          <Text style={[styles.sheetTitle, { color: t.ink }]}>Near me</Text>
          {locationLabel && (
            <Text style={{ color: t.muted, fontSize: 13 }} numberOfLines={1}>
              📍 {locationLabel}
            </Text>
          )}
          {status && <Text style={{ color: t.muted, marginTop: 2 }}>{status}</Text>}
          {skipped > 0 && (
            <Text style={{ color: t.muted, fontSize: 12, marginTop: 2 }}>
              {skipped} skipped (no coordinates)
            </Text>
          )}
        </View>
        <BottomSheetFlatList
          ref={listRef}
          data={items}
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
            paddingHorizontal: 16,
            paddingBottom: insets.bottom + 96,
          }}
          renderItem={({ item }) => {
            const active = highlightId === item.card.id;
            return (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/bookmarks/[id]',
                    params: { id: item.card.id, name: item.card.name },
                  })
                }
                style={[
                  styles.card,
                  {
                    backgroundColor: t.bg,
                    borderColor: active ? t.accent : t.border,
                    borderWidth: active ? 2 : StyleSheet.hairlineWidth,
                  },
                ]}>
                <View style={styles.cardTop}>
                  <Text
                    style={[styles.cardName, { color: t.ink }]}
                    numberOfLines={1}>
                    {item.card.name}
                  </Text>
                  <Text style={[styles.cardName, { color: t.ink }]}>
                    {item.distanceMiles.toFixed(1)} mi
                  </Text>
                </View>
                <Text style={{ color: t.muted, fontSize: 12 }}>
                  {item.listLabel.icon} {item.listLabel.name}
                </Text>
                {item.card.tags.length > 0 && (
                  <View style={styles.tags}>
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
  pinLabel: {
    fontSize: 12,
    fontWeight: '700',
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
  sheetHeader: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 2,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  card: {
    gap: 4,
    borderRadius: 14,
    padding: 12,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardName: {
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
});
