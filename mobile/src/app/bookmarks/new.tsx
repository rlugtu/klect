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
import { useLocalSearchParams, useRouter } from 'expo-router';

import { trpc } from '@/client/api';
import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';

/** Create a bookmark inside a list (trpc.bookmarks.create), with link autofill. */
export default function NewBookmarkScreen() {
  const router = useRouter();
  const { listId } = useLocalSearchParams<{ listId: string; listName?: string }>();
  const { theme } = useTheme();
  const muted = THEME_TOKENS[theme].muted;

  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [rating, setRating] = useState(0);
  const [images, setImages] = useState<string[]>([]);
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

  async function save() {
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    if (!listId) return;
    setBusy(true);
    setError(null);
    try {
      await trpc.bookmarks.create.mutate({
        listId,
        data: {
          name: name.trim(),
          description: description.trim(),
          urls: url.trim() ? [url.trim()] : [],
          images,
          notes: '',
          location: '',
          latitude: null,
          longitude: null,
          rating,
          visited: false,
          videoUrl: '',
          videoType: '',
          tagNames: tagsText.split(',').map((t) => t.trim()).filter(Boolean),
        },
      });
      router.back();
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
            className="flex-1 rounded-lg border border-border px-4 py-3 text-ink"
            placeholder="Paste a link"
            placeholderTextColor={muted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            value={url}
            onChangeText={setUrl}
          />
          <Pressable
            className="items-center justify-center rounded-lg border border-border px-3"
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
          className="rounded-lg border border-border px-4 py-3 text-ink"
          placeholder="Name"
          placeholderTextColor={muted}
          value={name}
          onChangeText={setName}
        />
        <TextInput
          className="rounded-lg border border-border px-4 py-3 text-ink"
          placeholder="Description"
          placeholderTextColor={muted}
          multiline
          value={description}
          onChangeText={setDescription}
        />
        <TextInput
          className="rounded-lg border border-border px-4 py-3 text-ink"
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
          className="items-center rounded-lg bg-primary py-3"
          disabled={busy}
          onPress={save}>
          {busy ? (
            <ActivityIndicator color={THEME_TOKENS[theme].primaryInk} />
          ) : (
            <Text className="font-semibold text-primary-ink">Save bookmark</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
