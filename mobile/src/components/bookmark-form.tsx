import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { trpc } from '@/client/api';
import { LocationInput } from '@/components/location-input';
import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';
import type { RetrievedPlace } from '@web/lib/core/places';

// Hard cap on the blocking autofill fetch so the loading overlay can never hang.
const AUTOFILL_TIMEOUT_MS = 15000;

// The exact `data` shape web's create/update procedures accept — no hand DTOs.
export type BookmarkData = Parameters<
  typeof trpc.bookmarks.create.mutate
>[0]['data'];

export const EMPTY_BOOKMARK: BookmarkData = {
  name: '',
  description: '',
  urls: [],
  images: [],
  notes: '',
  location: '',
  latitude: null,
  longitude: null,
  rating: 0,
  visited: false,
  videoUrl: '',
  videoType: '',
  tagNames: [],
};

type Props = {
  initial: BookmarkData;
  submitLabel: string;
  onSubmit: (data: BookmarkData) => Promise<void>;
  // Optional content rendered at the top of the form (e.g. the standalone flow's list picker).
  header?: ReactNode;
  // When true (e.g. a URL shared into the app), fetch page metadata once on mount.
  autofillOnMount?: boolean;
};

/**
 * Reusable bookmark editor. Edits name/url/description/tags/rating and merges
 * over `initial`, preserving fields it doesn't surface (notes, location, coords,
 * visited, video, extra urls) — so editing never wipes them.
 */
export default function BookmarkForm({
  initial,
  submitLabel,
  onSubmit,
  header,
  autofillOnMount,
}: Props) {
  const { theme } = useTheme();
  const muted = THEME_TOKENS[theme].muted;
  const insets = useSafeAreaInsets();

  const [url, setUrl] = useState(initial.urls[0] ?? '');
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [tagsText, setTagsText] = useState(initial.tagNames.join(', '));
  const [rating, setRating] = useState(initial.rating);
  const [images, setImages] = useState<string[]>(initial.images);
  const [location, setLocation] = useState(initial.location);
  const [latitude, setLatitude] = useState<number | null>(initial.latitude);
  const [longitude, setLongitude] = useState<number | null>(initial.longitude);
  const [videoUrl, setVideoUrl] = useState(initial.videoUrl);
  const [videoType, setVideoType] = useState(initial.videoType);
  const [autofilling, setAutofilling] = useState(false); // phase 1 (blocking)
  const [enhancing, setEnhancing] = useState(false); // phase 2 (non-blocking)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Phase 2 — comprehension. Its own abort/timeout; returns null on failure so the
  // fast fields from phase 1 stand.
  async function comprehendUrl(target: string) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AUTOFILL_TIMEOUT_MS);
    try {
      return await trpc.metadata.comprehend.query(
        { url: target },
        { signal: controller.signal },
      );
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function autofill() {
    const target = url.trim();
    if (!target) return;
    // Drop the keyboard the instant the (blocking) fetch begins.
    Keyboard.dismiss();
    setAutofilling(true);
    setError(null);
    // Phase 1 — fast extraction under the blocking overlay. Always resolve — cap it.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AUTOFILL_TIMEOUT_MS);
    try {
      const res = await trpc.metadata.extract.query(
        { url: target },
        { signal: controller.signal },
      );
      if (res.ok) {
        if (res.data.title) setName(res.data.title);
        if (res.data.description) setDescription(res.data.description);
        if (res.data.images.length) setImages(res.data.images);
        setVideoUrl(res.data.video?.url ?? '');
        setVideoType(res.data.video?.type ?? '');
      } else {
        setError(res.error);
        return; // extraction failed — skip phase 2
      }
    } catch (e) {
      setError(
        controller.signal.aborted
          ? 'Autofill timed out. Try again.'
          : e instanceof Error
            ? e.message
            : 'Autofill failed',
      );
      return;
    } finally {
      clearTimeout(timer);
      setAutofilling(false);
    }

    // Phase 2 — comprehension, non-blocking (form stays editable). Refined
    // title/description win; tags/location fill only when still empty.
    setEnhancing(true);
    const c = await comprehendUrl(target);
    if (c) {
      if (c.title) setName(c.title);
      if (c.description) setDescription(c.description);
      if (c.tags.length && !tagsText.trim()) setTagsText(c.tags.join(', '));
      if (c.location && !location.trim()) {
        setLocation(c.location);
        setLatitude(c.latitude);
        setLongitude(c.longitude);
      }
    }
    setEnhancing(false);
  }

  // Auto-fetch page metadata once when the form opens with a prefilled URL
  // (e.g. a link shared into the app). Guarded so it runs a single time.
  const didAutofill = useRef(false);
  useEffect(() => {
    if (autofillOnMount && !didAutofill.current && url.trim()) {
      didAutofill.current = true;
      autofill();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autofillOnMount]);

  // Autofill when a place is picked in the Location field. Location + coords always overwrite
  // (that's the point of picking a place). For a business (POI) the name/description/url/photos are
  // filled only when the user hasn't already typed them, so a pick never clobbers existing input;
  // the website unfurl that follows respects the same pre-pick emptiness.
  async function handleLocationAutofill(place: RetrievedPlace) {
    setLocation(place.address);
    setLatitude(place.lat);
    setLongitude(place.lon);
    if (!place.isPoi) return; // plain address — location only

    // Capture emptiness once, before any setState — closure values reflect the pre-pick state and
    // gate both the place data below and the later website unfurl.
    const fillName = !name.trim();
    const fillDescription = !description.trim();
    const fillUrl = !url.trim();
    const fillImages = images.length === 0;

    if (fillName) setName(place.name);
    if (fillUrl) setUrl(place.website); // '' clears the field when the business has no site
    if (fillDescription) setDescription(place.category); // provisional; the unfurl may replace it

    if (!place.website) return;
    Keyboard.dismiss();
    setAutofilling(true);
    // Phase 1 — extract the website (blocking).
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AUTOFILL_TIMEOUT_MS);
    try {
      const res = await trpc.metadata.extract.query(
        { url: place.website },
        { signal: controller.signal },
      );
      if (res.ok) {
        // A POI's own name wins over the unfurl title; only fall back to the title when the POI had
        // no name and the field was empty.
        if (fillName && !place.name && res.data.title) setName(res.data.title);
        if (fillDescription && res.data.description) setDescription(res.data.description);
        if (fillImages && res.data.images.length) setImages(res.data.images);
        // Video tracks the photos/media slot, which "fill only when empty" also protects.
        if (fillImages) {
          setVideoUrl(res.data.video?.url ?? '');
          setVideoType(res.data.video?.type ?? '');
        }
      }
    } catch {
      // Keep the basics set above.
    } finally {
      clearTimeout(timer);
      setAutofilling(false);
    }

    // Phase 2 — enrich description/tags (location + coords already set by the place).
    setEnhancing(true);
    const c = await comprehendUrl(place.website);
    if (c) {
      if (fillDescription && c.description) setDescription(c.description);
      if (c.tags.length && !tagsText.trim()) setTagsText(c.tags.join(', '));
    }
    setEnhancing(false);
  }

  async function submit() {
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    setBusy(true);
    setError(null);
    const first = url.trim();
    const urls = first ? [first, ...initial.urls.slice(1)] : initial.urls.slice(1);
    try {
      await onSubmit({
        ...initial,
        name: name.trim(),
        description: description.trim(),
        urls,
        images,
        location: location.trim(),
        latitude,
        longitude,
        rating,
        videoUrl,
        videoType,
        tagNames: tagsText.split(',').map((t) => t.trim()).filter(Boolean),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        className="flex-1 bg-bg"
        // Add the bottom safe-area inset so the Save button clears the home
        // indicator (notably in the share-extension flow, which has no tab bar).
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 16 + insets.bottom,
          gap: 12,
        }}
        keyboardShouldPersistTaps="handled"
        // Inset the scroll view by the keyboard (instead of shrinking the frame with a
        // KeyboardAvoidingView) so the focused field always scrolls into view above the
        // keyboard. Critical inside the fixed-height iOS share sheet, where a padding-based
        // avoider pushed the whole form off-screen and left it blank while typing.
        automaticallyAdjustKeyboardInsets>
        {header ? (
          <>
            {header}
            {/* Separate the list-picker section from the bookmark fields below, with the
                "Bookmark" section header sharing the divider row. */}
            <View className="my-1 flex-row items-center gap-3">
              <Text className="font-sans-medium text-sm uppercase text-muted">
                Bookmark
              </Text>
              <View className="h-px flex-1 bg-border" />
            </View>
          </>
        ) : null}
        <View className="flex-row gap-2">
          <TextInput
            className="flex-1 rounded-skin border-skin border-border px-4 py-3 text-ink"
            placeholder="Paste a link"
            placeholderTextColor={muted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            value={url}
            onChangeText={setUrl}
          />
          <Pressable
            className="items-center justify-center rounded-skin border-skin border-border px-3"
            disabled={autofilling || enhancing}
            onPress={autofill}>
            {autofilling ? (
              <ActivityIndicator />
            ) : (
              <Text className="text-ink">Autofill</Text>
            )}
          </Pressable>
        </View>

        {/* Non-blocking phase-2 indicator — the form stays editable while it runs. */}
        {enhancing && (
          <View className="flex-row items-center gap-2">
            <ActivityIndicator size="small" />
            <Text className="text-sm text-muted">✨ Enhancing details…</Text>
          </View>
        )}

        <View className="gap-1">
          <LocationInput
            initialLocation={initial.location}
            onLocationChange={(text) => {
              setLocation(text);
              // Free-typed text no longer matches the picked pin — drop the coordinates.
              setLatitude(null);
              setLongitude(null);
            }}
            onAutofill={handleLocationAutofill}
          />
          <Text className="text-sm text-muted">
            Pick a business to autofill its name, photos & details.
          </Text>
        </View>

        <TextInput
          className="rounded-skin border-skin border-border px-4 py-3 text-ink"
          placeholder="Name"
          placeholderTextColor={muted}
          value={name}
          onChangeText={setName}
        />
        <TextInput
          className="rounded-skin border-skin border-border px-4 py-3 text-ink"
          placeholder="Description"
          placeholderTextColor={muted}
          multiline
          value={description}
          onChangeText={setDescription}
        />
        <View className="gap-1">
          <TextInput
            className="rounded-skin border-skin border-border px-4 py-3 text-ink"
            placeholder="Tags (comma separated)"
            placeholderTextColor={muted}
            autoCapitalize="none"
            value={tagsText}
            // Tags render as #hashtags in the UI, but the "#" is display-only and never
            // stored — strip any the user types so it can't leak into the saved name.
            onChangeText={(text) => setTagsText(text.replace(/#/g, ''))}
          />
          <Text className="text-sm text-muted">
            No need for a #, it&apos;s added automatically. Tags are saved in lowercase.
          </Text>
        </View>

        <View className="flex-row items-center gap-2">
          <Text className="text-muted">Rating</Text>
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable key={n} onPress={() => setRating(n === rating ? 0 : n)}>
              <Text className={`text-2xl ${n <= rating ? 'text-accent' : 'text-muted'}`}>
                {n <= rating ? '★' : '☆'}
              </Text>
            </Pressable>
          ))}
        </View>

        {error && <Text className="text-danger">{error}</Text>}

        <Pressable
          className="items-center rounded-skin bg-primary py-3"
          disabled={busy}
          onPress={submit}>
          {busy ? (
            <ActivityIndicator color={THEME_TOKENS[theme].primaryInk} />
          ) : (
            <Text className="font-semibold text-primary-ink">{submitLabel}</Text>
          )}
        </Pressable>
      </ScrollView>

      {/* Full-screen blocking overlay while link data is fetched: dims the whole
          screen and intercepts all touches until the fetch resolves. */}
      <Modal
        transparent
        visible={autofilling}
        animationType="fade"
        onRequestClose={() => {}}>
        <View
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <View className="items-center gap-3 rounded-skin bg-panel px-8 py-6">
            <ActivityIndicator size="large" color={THEME_TOKENS[theme].primary} />
            <Text className="text-ink">Fetching link…</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}
