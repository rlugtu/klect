import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  InputAccessoryView,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { trpc } from '@/client/api';
import { LocationInput } from '@/components/location-input';
import RatingStars from '@/components/rating-stars';
import VisitedPill from '@/components/visited-pill';
import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';
import type { RetrievedPlace } from '@web/lib/core/places';

// Hard cap on the autofill fetch so the loading overlay can never hang. Defense in depth
// only: the server already bounds the slow half of the unfurl (COMPREHENSION_TIMEOUT_MS in
// web's core/metadata.ts), so this only fires if the server itself stops answering.
const AUTOFILL_TIMEOUT_MS = 15000;

// Ties the iOS "Done" keyboard accessory bar to the multiline Description field.
const DESC_ACCESSORY_ID = 'bookmarkDescDone';

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
  // Page name, rendered in the scrolling body (the app's headers are deliberately titleless).
  pageTitle?: string;
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
  pageTitle,
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
  const [visited, setVisited] = useState(initial.visited);
  const [images, setImages] = useState<string[]>(initial.images);
  const [location, setLocation] = useState(initial.location);
  const [latitude, setLatitude] = useState<number | null>(initial.latitude);
  const [longitude, setLongitude] = useState<number | null>(initial.longitude);
  const [videoUrl, setVideoUrl] = useState(initial.videoUrl);
  const [videoType, setVideoType] = useState(initial.videoType);
  const [autofilling, setAutofilling] = useState(false); // manual (blocking overlay)
  const [prefilling, setPrefilling] = useState(false); // on-mount (non-blocking)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track whether the user has hand-edited name/description. On-mount (non-blocking) autofill uses
  // this to fill/refine those fields *without* clobbering anything typed while the fetch was in
  // flight; the manual Autofill button ignores it (that press is an explicit overwrite).
  const nameDirty = useRef(false);
  const descDirty = useRef(false);

  // Abort handle for the in-flight *blocking* fetch, so the overlay's Cancel can drop it
  // instead of leaving the user stuck until the timeout. `cancelled` tells the catch path
  // apart from a real timeout (both surface as an aborted signal).
  const blockingAbort = useRef<AbortController | null>(null);
  const cancelled = useRef(false);

  function cancelAutofill() {
    cancelled.current = true;
    blockingAbort.current?.abort();
    blockingAbort.current = null;
    setAutofilling(false);
  }

  // `blocking` (manual Autofill button) drops the full-screen overlay and overwrites the fields
  // unconditionally. Non-blocking (on-mount, e.g. a shared URL) keeps the whole drawer — notably
  // the list picker — interactive: it shows only an inline indicator and respects hand-edits.
  //
  // One round trip: `metadata.fetch` runs extraction and comprehension concurrently server-side
  // and bounds the slow half, so the fields fill once instead of filling then changing again.
  async function autofill(blocking = true) {
    const target = url.trim();
    if (!target) return;
    const respectDirty = !blocking;
    // Drop the keyboard the instant a blocking fetch begins (on-mount there's no keyboard up yet).
    if (blocking) Keyboard.dismiss();
    (blocking ? setAutofilling : setPrefilling)(true);
    setError(null);
    const controller = new AbortController();
    if (blocking) {
      cancelled.current = false;
      blockingAbort.current = controller;
    }
    const timer = setTimeout(() => controller.abort(), AUTOFILL_TIMEOUT_MS);
    try {
      const res = await trpc.metadata.fetch.query(
        { url: target },
        { signal: controller.signal },
      );
      if (blocking && cancelled.current) return; // cancelled mid-flight, discard the result
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const {
        title,
        description: desc,
        images: imgs,
        video,
        tags,
        location: loc,
        latitude: lat,
        longitude: lon,
      } = res.data;
      if (title && (!respectDirty || !nameDirty.current)) setName(title);
      if (desc && (!respectDirty || !descDirty.current)) setDescription(desc);
      if (imgs.length) setImages(imgs);
      setVideoUrl(video?.url ?? '');
      setVideoType(video?.type ?? '');
      // Tags/location fill only when still empty — never overwrite what's already there.
      if (tags.length && !tagsText.trim()) setTagsText(tags.join(', '));
      if (loc && !location.trim()) {
        setLocation(loc);
        setLatitude(lat);
        setLongitude(lon);
      }
    } catch (e) {
      if (blocking && cancelled.current) return; // user cancelled, not an error to report
      setError(
        controller.signal.aborted
          ? 'Autofill timed out. Try again.'
          : e instanceof Error
            ? e.message
            : 'Autofill failed',
      );
    } finally {
      clearTimeout(timer);
      if (blocking) blockingAbort.current = null;
      (blocking ? setAutofilling : setPrefilling)(false);
    }
  }

  // Auto-fetch page metadata once when the form opens with a prefilled URL
  // (e.g. a link shared into the app). Guarded so it runs a single time.
  const didAutofill = useRef(false);
  useEffect(() => {
    if (autofillOnMount && !didAutofill.current && url.trim()) {
      didAutofill.current = true;
      autofill(false); // non-blocking — keep the list picker + form live while metadata loads
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
    // Unfurl the business's website (blocking), in one round trip.
    const controller = new AbortController();
    cancelled.current = false;
    blockingAbort.current = controller;
    const timer = setTimeout(() => controller.abort(), AUTOFILL_TIMEOUT_MS);
    try {
      const res = await trpc.metadata.fetch.query(
        { url: place.website },
        { signal: controller.signal },
      );
      if (cancelled.current) return; // cancelled mid-flight, discard the result
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
        // Tags only — location + coords are already set by the picked place.
        if (res.data.tags.length && !tagsText.trim()) {
          setTagsText(res.data.tags.join(', '));
        }
      }
    } catch {
      // Keep the basics set above.
    } finally {
      clearTimeout(timer);
      blockingAbort.current = null;
      setAutofilling(false);
    }
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
        visited,
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
        // Let a downward drag/scroll dismiss the keyboard — the multiline Description keeps
        // Enter as a newline, so there's no return-key dismissal; this + the iOS "Done" bar
        // (below) give the user a way out. ('interactive' = drag over the keyboard on iOS.)
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        // Inset the scroll view by the keyboard (instead of shrinking the frame with a
        // KeyboardAvoidingView) so the focused field always scrolls into view above the
        // keyboard. Critical inside the fixed-height iOS share sheet, where a padding-based
        // avoider pushed the whole form off-screen and left it blank while typing.
        automaticallyAdjustKeyboardInsets>
        {pageTitle ? (
          <Text className="font-serif text-3xl text-ink">{pageTitle}</Text>
        ) : null}
        {header ? (
          <>
            {header}
            {/* Separate the list-picker section from the bookmark fields below, with the
                "Bookmark" section header sharing the divider row. While the on-mount autofill
                runs, the label carries an "Autofilling…" indicator and the fields below dim — so
                the loading state reads as scoped to the bookmark, leaving the list picker live. */}
            <View className="my-1 flex-row items-center gap-3">
              <Text className="font-sans-medium text-sm uppercase text-muted">
                Bookmark
              </Text>
              {prefilling && (
                <View className="flex-row items-center gap-1.5">
                  <ActivityIndicator size="small" />
                  <Text className="text-sm text-muted">Autofilling…</Text>
                </View>
              )}
              <View className="h-px flex-1 bg-border" />
            </View>
          </>
        ) : null}
        {/* Bookmark fields — dimmed + touch-blocked while the on-mount autofill (prefilling) is in
            flight, so the user can't edit values that are about to be overwritten. The list picker
            (header, above) stays interactive. */}
        <View
          pointerEvents={prefilling ? 'none' : 'auto'}
          style={{ gap: 12, opacity: prefilling ? 0.5 : 1 }}>
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
            accessibilityRole="button"
            accessibilityLabel="Autofill from the link"
            className="items-center justify-center rounded-skin border-skin border-border px-3"
            disabled={autofilling || prefilling}
            onPress={() => autofill(true)}>
            {autofilling ? (
              <ActivityIndicator />
            ) : (
              <Text className="text-ink">Autofill</Text>
            )}
          </Pressable>
        </View>

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
            Adding a location makes it findable on Near me.
          </Text>
        </View>

        <TextInput
          className="rounded-skin border-skin border-border px-4 py-3 text-ink"
          placeholder="Name"
          placeholderTextColor={muted}
          value={name}
          onChangeText={(text) => {
            nameDirty.current = true;
            setName(text);
          }}
        />
        <TextInput
          className="rounded-skin border-skin border-border px-4 py-3 text-ink"
          placeholder="Description"
          placeholderTextColor={muted}
          multiline
          // Multiline keeps Enter as a newline, so there's no return-key dismissal — the iOS
          // accessory bar (rendered below) gives a "Done" affordance to close the keyboard.
          inputAccessoryViewID={DESC_ACCESSORY_ID}
          value={description}
          onChangeText={(text) => {
            descDirty.current = true;
            setDescription(text);
          }}
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

        {/* Stacked rather than side by side: the interactive stars claim 44pt per star for
            the tap target, which leaves no room for the Visited pill on the same row. */}
        <View className="gap-2">
          <View className="flex-row items-center justify-between gap-2">
            <Text className="text-muted">Rating</Text>
            <RatingStars value={rating} onChange={setRating} />
          </View>
          <View className="flex-row items-center justify-between gap-2">
            <Text className="text-muted">Visited</Text>
            <VisitedPill visited={visited} onToggle={() => setVisited((v) => !v)} />
          </View>
        </View>

        {error && <Text className="text-danger">{error}</Text>}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={submitLabel}
          className="items-center rounded-skin bg-primary py-3"
          disabled={busy}
          onPress={submit}>
          {busy ? (
            <ActivityIndicator color={THEME_TOKENS[theme].primaryInk} />
          ) : (
            <Text className="font-semibold text-primary-ink">{submitLabel}</Text>
          )}
        </Pressable>
        </View>
      </ScrollView>

      {/* Full-screen blocking overlay while link data is fetched: dims the whole
          screen and intercepts all touches until the fetch resolves. Cancel (and the
          Android back button) aborts the request and hands the form straight back. */}
      <Modal
        transparent
        visible={autofilling}
        animationType="fade"
        onRequestClose={cancelAutofill}>
        <View
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <View className="items-center gap-3 rounded-skin bg-panel px-8 py-6">
            <ActivityIndicator size="large" color={THEME_TOKENS[theme].primary} />
            <Text className="text-ink">Fetching link…</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel fetching the link"
              hitSlop={8}
              onPress={cancelAutofill}>
              <Text className="font-sans-semibold text-primary">Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* iOS "Done" bar above the keyboard for the multiline Description field (which keeps
          Enter as a newline, so there's no return-key dismissal). iOS-only — Android relies
          on the ScrollView's drag-to-dismiss. */}
      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID={DESC_ACCESSORY_ID}>
          <View className="flex-row justify-end border-t border-border bg-panel px-4 py-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Done, close the keyboard"
              hitSlop={8}
              onPress={() => Keyboard.dismiss()}>
              <Text className="font-sans-semibold text-primary">Done</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      )}
    </View>
  );
}
