import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { trpc } from '@/client/api';
import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';
// Type-only import from web (erased at compile time — no runtime coupling).
import type { PlaceSuggestion, RetrievedPlace } from '@web/lib/core/places';

const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 350;

/** Cheap v4-ish UUID — only groups Mapbox's billing session, so it needs no crypto strength. */
function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Location field with address / business autocomplete (Mapbox Search Box, proxied by web's
 * tRPC `places` procedures). Mirrors web's `LocationInput`: free typing pushes the text up via
 * `onLocationChange` (the parent clears its coordinates — the text no longer matches a pin);
 * picking a suggestion resolves its coordinates via a second `retrieve` call and reports the full
 * place through `onAutofill`. A per-session token ties the suggest+retrieve calls together for
 * Mapbox's session billing.
 */
export function LocationInput({
  initialLocation = '',
  label = 'Location',
  onLocationChange,
  onAutofill,
}: {
  initialLocation?: string;
  // Section label above the field so it's clear you can search/add an address (powers Near me).
  label?: string;
  // Fired on free typing so the parent can update its location text and clear stale coordinates.
  onLocationChange?: (text: string) => void;
  // Fired after a successful retrieve so the parent can set coords + autofill from a picked business.
  onAutofill?: (place: RetrievedPlace) => void;
}) {
  const { theme } = useTheme();
  const muted = THEME_TOKENS[theme].muted;

  const [query, setQuery] = useState(initialLocation);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // Ignore responses that arrive after a newer request, and skip refetching a query we just
  // resolved (the address set programmatically after a pick, or the initial edit-form value).
  const reqId = useRef(0);
  const lastFetched = useRef<string | null>(initialLocation.trim() || null);
  // Groups suggest + the final retrieve into one Mapbox billing session; rotated after each pick.
  const sessionToken = useRef<string>(uuid());

  useEffect(() => {
    const q = query.trim();
    const handle = setTimeout(async () => {
      if (q.length < MIN_QUERY_LENGTH) {
        setSuggestions([]);
        setError(null);
        lastFetched.current = null;
        return;
      }
      if (q === lastFetched.current) return; // unchanged (or just-picked) — no refetch

      const id = ++reqId.current;
      lastFetched.current = q;
      try {
        const result = await trpc.places.search.query({
          text: q,
          sessionToken: sessionToken.current,
        });
        if (id !== reqId.current) return; // a newer request superseded this one
        if (result.ok) {
          setSuggestions(result.data);
          setError(null);
        } else {
          setSuggestions([]);
          setError(result.error);
        }
      } catch (e) {
        if (id !== reqId.current) return;
        setSuggestions([]);
        setError(e instanceof Error ? e.message : 'Location search failed');
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [query]);

  async function pick(s: PlaceSuggestion) {
    // Fill the text and close immediately; coordinates arrive from the retrieve call.
    lastFetched.current = s.address.trim(); // prevent the query-change effect from refetching
    setQuery(s.address);
    setSuggestions([]);
    setError(null);
    setOpen(false);

    try {
      const result = await trpc.places.retrieve.query({
        id: s.id,
        sessionToken: sessionToken.current,
      });
      // Rotate the session token — this suggest→retrieve session is complete.
      sessionToken.current = uuid();

      if (result.ok) {
        // Keep the fuller address Mapbox returns on retrieve, if present.
        if (result.data.address) {
          lastFetched.current = result.data.address.trim();
          setQuery(result.data.address);
        }
        onAutofill?.(result.data);
      } else {
        setError(result.error);
      }
    } catch (e) {
      sessionToken.current = uuid();
      setError(e instanceof Error ? e.message : 'Location lookup failed');
    }
  }

  const showDropdown =
    open &&
    query.trim().length >= MIN_QUERY_LENGTH &&
    (suggestions.length > 0 || !!error);

  return (
    <View className="gap-1.5">
      {label ? (
        <Text className="font-sans-medium text-sm uppercase text-muted">{label}</Text>
      ) : null}
      <TextInput
        className="rounded-skin border-skin border-border px-4 py-3 text-ink"
        placeholder="Search an address or business…"
        placeholderTextColor={muted}
        autoCapitalize="none"
        autoCorrect={false}
        value={query}
        onChangeText={(text) => {
          setQuery(text);
          setOpen(true);
          // Free typing means the text no longer matches the picked pin — parent clears coords.
          onLocationChange?.(text);
        }}
        onFocus={() => setOpen(true)}
      />

      {showDropdown && (
        <View className="mt-2 rounded-skin border-skin border-border bg-panel p-1">
          {error ? (
            <Text className="p-2 text-sm text-muted">{error}</Text>
          ) : (
            suggestions.map((s, i) => (
              <Pressable
                key={`${s.id},${i}`}
                onPress={() => void pick(s)}
                className="gap-0.5 rounded-skin-sm px-2 py-2">
                <Text className="text-ink" numberOfLines={1}>
                  {s.label}
                </Text>
                <Text className="text-sm text-muted" numberOfLines={1}>
                  {s.address}
                </Text>
              </Pressable>
            ))
          )}
        </View>
      )}
    </View>
  );
}
