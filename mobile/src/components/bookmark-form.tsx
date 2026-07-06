import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { trpc } from '@/client/api';
import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';

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
};

/**
 * Reusable bookmark editor. Edits name/url/description/tags/rating and merges
 * over `initial`, preserving fields it doesn't surface (notes, location, coords,
 * visited, video, extra urls) — so editing never wipes them.
 */
export default function BookmarkForm({ initial, submitLabel, onSubmit }: Props) {
  const { theme } = useTheme();
  const muted = THEME_TOKENS[theme].muted;

  const [url, setUrl] = useState(initial.urls[0] ?? '');
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [tagsText, setTagsText] = useState(initial.tagNames.join(', '));
  const [rating, setRating] = useState(initial.rating);
  const [images, setImages] = useState<string[]>(initial.images);
  const [autofilling, setAutofilling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function autofill() {
    if (!url.trim()) return;
    setAutofilling(true);
    setError(null);
    try {
      const res = await trpc.metadata.fetch.query({ url: url.trim() });
      if (res.ok) {
        if (res.data.title) setName(res.data.title);
        if (res.data.description) setDescription(res.data.description);
        if (res.data.images.length) setImages(res.data.images);
      } else {
        setError(res.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Autofill failed');
    }
    setAutofilling(false);
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
        rating,
        tagNames: tagsText.split(',').map((t) => t.trim()).filter(Boolean),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        className="flex-1 bg-bg"
        contentContainerStyle={{ padding: 16, gap: 12 }}
        keyboardShouldPersistTaps="handled">
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
            disabled={autofilling}
            onPress={autofill}>
            {autofilling ? (
              <ActivityIndicator />
            ) : (
              <Text className="text-ink">Autofill</Text>
            )}
          </Pressable>
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
        <TextInput
          className="rounded-skin border-skin border-border px-4 py-3 text-ink"
          placeholder="Tags (comma separated)"
          placeholderTextColor={muted}
          autoCapitalize="none"
          value={tagsText}
          onChangeText={setTagsText}
        />

        <View className="flex-row items-center gap-2">
          <Text className="text-muted">Rating</Text>
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable key={n} onPress={() => setRating(n === rating ? 0 : n)}>
              <Text className="text-2xl text-warning">
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
    </KeyboardAvoidingView>
  );
}
