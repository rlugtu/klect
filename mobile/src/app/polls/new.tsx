import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';

import { trpc } from '@/client/api';
import DateTimeField from '@/components/date-time-field';
import Skeleton from '@/components/skeleton';
import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';

type Bookmarks = Awaited<ReturnType<typeof trpc.bookmarks.forList.query>>;

export default function NewPollScreen() {
  const router = useRouter();
  const { listId, pollId } = useLocalSearchParams<{
    listId: string;
    listName?: string;
    pollId?: string; // present → edit an existing poll
  }>();
  const isEdit = !!pollId;
  const t = THEME_TOKENS[useTheme().theme];
  const sheetRef = useRef<BottomSheetModal>(null);

  const [bookmarks, setBookmarks] = useState<Bookmarks>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startAt, setStartAt] = useState<Date>(new Date());
  const [endAt, setEndAt] = useState<Date | null>(null);
  const [maxVotes, setMaxVotes] = useState(''); // '' = unlimited
  const [revotesAllowed, setRevotesAllowed] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false); // create-only; immutable after

  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!listId) return;
      setLoading(true);
      trpc.bookmarks.forList
        .query({ listId })
        .then(setBookmarks)
        .catch((e) => setError(e instanceof Error ? e.message : 'Request failed'))
        .finally(() => setLoading(false));
    }, [listId]),
  );

  // Edit mode: prefill fields + selected options from the existing poll (once).
  useEffect(() => {
    if (!pollId) return;
    trpc.polls.get
      .query({ pollId })
      .then((poll) => {
        setName(poll.name);
        setDescription(poll.description);
        setStartAt(new Date(poll.startAt));
        setEndAt(poll.endAt ? new Date(poll.endAt) : null);
        setMaxVotes(poll.maxVotes != null ? String(poll.maxVotes) : '');
        setRevotesAllowed(poll.revotesAllowed);
        setSelected(new Set(poll.options.map((o) => o.bookmarkId)));
      })
      .catch(() => {});
  }, [pollId]);

  const availableTags = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color: string }>();
    for (const b of bookmarks) for (const bt of b.tags) map.set(bt.tag.id, bt.tag);
    return [...map.values()];
  }, [bookmarks]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bookmarks.filter(
      (b) =>
        (q === '' || b.name.toLowerCase().includes(q)) &&
        (tagFilter.size === 0 || b.tags.some((bt) => tagFilter.has(bt.tag.id))),
    );
  }, [bookmarks, query, tagFilter]);

  const allShownSelected = shown.length > 0 && shown.every((b) => selected.has(b.id));

  function toggleIn(
    setter: (updater: (prev: Set<string>) => Set<string>) => void,
    id: string,
  ) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allShownSelected) shown.forEach((b) => next.delete(b.id));
      else shown.forEach((b) => next.add(b.id));
      return next;
    });
  }

  async function submit() {
    setError(null);
    if (!name.trim()) return setError('Poll name is required.');
    if (selected.size < 2) return setError('Pick at least two bookmarks.');
    const maxV = maxVotes.trim() === '' ? null : Math.max(1, parseInt(maxVotes, 10) || 1);
    const data = {
      name: name.trim(),
      description: description.trim(),
      startAt,
      endAt,
      maxVotes: maxV,
      revotesAllowed,
      isAnonymous,
      bookmarkIds: [...selected],
    };
    setBusy(true);
    try {
      if (pollId) await trpc.polls.update.mutate({ pollId, data });
      else await trpc.polls.create.mutate({ listId, data });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save poll.');
      setBusy(false);
    }
  }

  const selectedTags = availableTags.filter((tag) => tagFilter.has(tag.id));

  return (
    <View className="flex-1 bg-bg">
      <Stack.Screen options={{ headerTitle: '' }} />

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
        <View className="gap-2">
          <Text className="font-sans-medium text-sm text-muted">Name</Text>
          <TextInput
            className="rounded-skin border-skin border-border px-4 py-3 font-sans text-ink"
            placeholder="What are we deciding?"
            placeholderTextColor={t.muted}
            value={name}
            onChangeText={setName}
          />
        </View>

        <View className="gap-2">
          <Text className="font-sans-medium text-sm text-muted">Description (optional)</Text>
          <TextInput
            className="rounded-skin border-skin border-border px-4 py-3 font-sans text-ink"
            placeholder="Add context"
            placeholderTextColor={t.muted}
            multiline
            value={description}
            onChangeText={setDescription}
          />
        </View>

        <View className="gap-2">
          <Text className="font-sans-medium text-sm text-muted">Starts</Text>
          <DateTimeField value={startAt} onChange={setStartAt} />
        </View>

        <View className="gap-2">
          <Text className="font-sans-medium text-sm text-muted">Ends (optional)</Text>
          <DateTimeField
            value={endAt}
            onChange={setEndAt}
            onClear={() => setEndAt(null)}
            minimumDate={startAt}
            placeholder="No end time"
          />
        </View>

        <View className="gap-2">
          <Text className="font-sans-medium text-sm text-muted">Votes per participant</Text>
          <TextInput
            className="rounded-skin border-skin border-border px-4 py-3 font-sans text-ink"
            placeholder="Unlimited"
            placeholderTextColor={t.muted}
            keyboardType="number-pad"
            value={maxVotes}
            onChangeText={(v) => setMaxVotes(v.replace(/[^0-9]/g, ''))}
          />
        </View>

        <View className="flex-row items-center justify-between">
          <Text className="font-sans-medium text-sm text-ink">Allow revotes</Text>
          <Switch value={revotesAllowed} onValueChange={setRevotesAllowed} />
        </View>

        {!isEdit && (
          <View className="gap-1.5">
            <View className="flex-row items-center justify-between">
              <Text className="font-sans-medium text-sm text-ink">Anonymous poll</Text>
              <Switch value={isAnonymous} onValueChange={setIsAnonymous} />
            </View>
            <Text className="font-sans text-xs text-muted">
              Hides who voted for what. This can only be set now and can’t be
              changed later.
            </Text>
          </View>
        )}

        <View className="h-px bg-border" />

        {/* Bookmark options */}
        <View className="flex-row items-center justify-between">
          <Text className="font-serif text-lg text-ink">Options</Text>
          <Text className="font-sans text-sm text-muted">{selected.size} selected</Text>
        </View>

        <View className="flex-row items-center gap-2">
          <TextInput
            className="flex-1 rounded-skin border-skin border-border px-4 py-2.5 font-sans text-ink"
            placeholder="Search bookmarks"
            placeholderTextColor={t.muted}
            autoCapitalize="none"
            autoCorrect={false}
            value={query}
            onChangeText={setQuery}
          />
          {availableTags.length > 0 && (
            <Pressable
              onPress={() => sheetRef.current?.present()}
              className="rounded-skin border-skin border-border px-3 py-2.5">
              <Text className="font-sans-semibold text-ink">Tags ▾</Text>
            </Pressable>
          )}
        </View>

        {selectedTags.length > 0 && (
          <View className="flex-row flex-wrap items-center gap-1">
            {selectedTags.map((tag) => (
              <Pressable
                key={tag.id}
                onPress={() => toggleIn(setTagFilter, tag.id)}
                style={{ backgroundColor: tag.color }}
                className="rounded-skin-sm px-2.5 py-0.5">
                <Text className="font-sans text-xs text-ink">
                  {tag.name.toLowerCase()} ✕
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {shown.length > 0 && (
          <Pressable onPress={toggleSelectAll} className="self-start">
            <Text className="font-sans-medium text-primary">
              {allShownSelected ? 'Clear all' : `Select all (${shown.length})`}
            </Text>
          </Pressable>
        )}

        {loading ? (
          <View className="gap-2">
            <Skeleton height={44} />
            <Skeleton height={44} />
            <Skeleton height={44} />
          </View>
        ) : shown.length === 0 ? (
          <Text className="font-serif-italic text-muted">No bookmarks match.</Text>
        ) : (
          <View className="gap-2">
            {shown.map((b) => {
              const on = selected.has(b.id);
              return (
                <Pressable
                  key={b.id}
                  onPress={() => toggleIn(setSelected, b.id)}
                  className={`flex-row items-center justify-between rounded-skin border-skin px-3 py-2.5 ${
                    on ? 'border-primary bg-primary/20' : 'border-border bg-panel'
                  }`}>
                  <Text className="flex-1 font-sans text-ink" numberOfLines={1}>
                    {b.name}
                  </Text>
                  {on && <Text className="text-primary">✓</Text>}
                </Pressable>
              );
            })}
          </View>
        )}

        {error && <Text className="font-sans text-danger">{error}</Text>}

        <Pressable
          onPress={submit}
          disabled={busy || selected.size < 2}
          className={`items-center rounded-skin py-3 ${
            busy || selected.size < 2 ? 'bg-border' : 'bg-primary'
          }`}>
          <Text className="font-sans-semibold text-primary-ink">
            {busy
              ? isEdit
                ? 'Saving…'
                : 'Creating…'
              : isEdit
                ? 'Save changes'
                : 'Create poll'}
          </Text>
        </Pressable>
      </ScrollView>

      <BottomSheetModal
        ref={sheetRef}
        backgroundStyle={{ backgroundColor: t.panel }}
        handleIndicatorStyle={{ backgroundColor: t.muted }}>
        <BottomSheetView style={{ paddingHorizontal: 16, paddingBottom: 32 }}>
          <Text className="mb-1 font-serif text-lg text-ink">Filter by tag</Text>
          {availableTags.map((tag) => {
            const on = tagFilter.has(tag.id);
            return (
              <Pressable
                key={tag.id}
                onPress={() => toggleIn(setTagFilter, tag.id)}
                className="flex-row items-center justify-between border-b border-border py-3">
                <View className="flex-row items-center gap-2">
                  <View
                    style={{ backgroundColor: tag.color }}
                    className="h-4 w-4 rounded-full"
                  />
                  <Text className="font-sans text-ink">{tag.name.toLowerCase()}</Text>
                </View>
                {on && <Text className="text-base text-primary">✓</Text>}
              </Pressable>
            );
          })}
        </BottomSheetView>
      </BottomSheetModal>
    </View>
  );
}
