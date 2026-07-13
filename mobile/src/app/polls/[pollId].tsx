import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { LinearTransition } from 'react-native-reanimated';

import { trpc } from '@/client/api';
import { authClient } from '@/client/auth';
import Skeleton from '@/components/skeleton';
import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';

type Poll = Awaited<ReturnType<typeof trpc.polls.get.query>>;

function Thumb({ images }: { images: string[] }) {
  const src = images[0];
  return src ? (
    <Image source={src} style={{ width: 48, height: 48, borderRadius: 8 }} contentFit="cover" />
  ) : (
    <View
      style={{ width: 48, height: 48, borderRadius: 8 }}
      className="items-center justify-center bg-bg">
      <Text>🔖</Text>
    </View>
  );
}

export default function PollDetailScreen() {
  const router = useRouter();
  const { pollId } = useLocalSearchParams<{ pollId: string }>();
  const t = THEME_TOKENS[useTheme().theme];
  const myId = authClient.useSession().data?.user?.id;

  const [poll, setPoll] = useState<Poll | null>(null);
  const [picks, setPicks] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<'vote' | 'results'>('vote');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!pollId) return;
    setError(null);
    trpc.polls.get
      .query({ pollId })
      .then((p) => {
        setPoll(p);
        setPicks(new Set(p.myOptionIds));
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Request failed'))
      .finally(() => setLoading(false));
  }, [pollId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load]),
  );

  // Default to the voting tab while the poll is open, else show results.
  useEffect(() => {
    if (!poll) return;
    const now = Date.now();
    const open =
      new Date(poll.startAt).getTime() <= now &&
      (poll.endAt == null || now < new Date(poll.endAt).getTime());
    setMode(open ? 'vote' : 'results');
  }, [poll?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !poll) {
    return (
      <View className="flex-1 bg-bg">
        <Stack.Screen options={{ title: 'Poll' }} />
        <View className="gap-3 p-4">
          <Skeleton height={28} />
          <Skeleton height={40} />
          <Skeleton height={56} />
          <Skeleton height={56} />
          <Skeleton height={56} />
        </View>
      </View>
    );
  }
  if (!poll) {
    return (
      <View className="flex-1 items-center justify-center bg-bg">
        <Stack.Screen options={{ title: 'Poll' }} />
        <Text className="font-sans text-danger">{error ?? 'Poll not found.'}</Text>
      </View>
    );
  }

  const now = Date.now();
  const start = new Date(poll.startAt).getTime();
  const end = poll.endAt ? new Date(poll.endAt).getTime() : null;
  const ended = end != null && now >= end;
  const notStarted = start > now;
  const active = !notStarted && !ended;
  const alreadyVoted = poll.myOptionIds.length > 0;
  const votingLocked = !active || (alreadyVoted && !poll.revotesAllowed);
  const canManage = poll.role === 'OWNER' || poll.creatorId === myId;
  const atCap = poll.maxVotes != null && picks.size >= poll.maxVotes;

  const changed =
    picks.size !== poll.myOptionIds.length ||
    [...picks].some((id) => !poll.myOptionIds.includes(id));

  const results = [...poll.options].sort((a, b) => b.votes.length - a.votes.length);
  const maxCount = Math.max(1, ...poll.options.map((o) => o.votes.length));
  const creator = poll.creator.displayName ?? poll.creator.name ?? 'Someone';

  function togglePick(optionId: string) {
    if (votingLocked) return;
    setPicks((prev) => {
      const next = new Set(prev);
      if (next.has(optionId)) next.delete(optionId);
      else {
        if (poll!.maxVotes != null && next.size >= poll!.maxVotes) return prev;
        next.add(optionId);
      }
      return next;
    });
  }

  async function submitVotes() {
    setBusy(true);
    try {
      await trpc.polls.submitVotes.mutate({ pollId: poll!.id, optionIds: [...picks] });
      load();
    } catch (e) {
      Alert.alert('Could not submit', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    Alert.alert('Delete poll?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await trpc.polls.delete.mutate({ pollId: poll!.id });
            router.back();
          } catch (e) {
            Alert.alert('Could not delete', e instanceof Error ? e.message : 'Try again.');
          }
        },
      },
    ]);
  }

  return (
    <View className="flex-1 bg-bg">
      <Stack.Screen options={{ title: poll.name }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
        <View className="gap-1">
          <Text className="font-serif text-2xl text-ink">{poll.name}</Text>
          {poll.description ? (
            <Text className="font-sans text-muted">{poll.description}</Text>
          ) : null}
          <Text className="font-sans text-sm text-muted">
            {poll.creator.icon ? `${poll.creator.icon} ` : ''}
            {creator}
            {end != null
              ? ` · ${ended ? 'Ended' : `Ends ${new Date(end).toLocaleDateString()}`}`
              : ' · No end time'}
            {poll.isAnonymous ? ' · 🔒 Anonymous' : ''}
          </Text>
        </View>

        {/* Vote / Results toggle */}
        <View className="flex-row overflow-hidden rounded-skin border-skin border-border">
          {(['vote', 'results'] as const).map((m) => (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              className={`flex-1 items-center py-2 ${mode === m ? 'bg-primary' : ''}`}>
              <Text
                className={
                  mode === m
                    ? 'font-sans-semibold text-primary-ink'
                    : 'font-sans text-muted'
                }>
                {m === 'vote' ? 'Vote' : 'Results'}
              </Text>
            </Pressable>
          ))}
        </View>

        {mode === 'vote' ? (
          <View className="gap-2">
            {poll.options.map((o) => {
              const on = picks.has(o.id);
              const disabled = votingLocked || (!on && atCap);
              return (
                <Animated.View key={o.id} layout={LinearTransition}>
                  <Pressable
                    onPress={() => togglePick(o.id)}
                    disabled={disabled}
                    className={`flex-row items-center gap-3 rounded-skin border-skin p-2 ${
                      on ? 'border-primary bg-primary/20' : 'border-border bg-panel'
                    } ${!on && disabled ? 'opacity-40' : ''}`}>
                    <Thumb images={o.bookmark.images} />
                    <Text className="flex-1 font-sans text-ink" numberOfLines={2}>
                      {o.bookmark.name}
                    </Text>
                    {on && <Text className="text-lg text-primary">✓</Text>}
                  </Pressable>
                </Animated.View>
              );
            })}

            {votingLocked ? (
              <Text className="mt-1 text-center font-sans text-sm text-muted">
                {ended
                  ? 'This poll has ended.'
                  : notStarted
                    ? 'Voting hasn’t opened yet.'
                    : 'You’ve voted.'}
              </Text>
            ) : (
              <>
                <Text className="mt-1 text-center font-sans text-sm text-muted">
                  {poll.maxVotes == null
                    ? 'Unlimited votes'
                    : `${Math.max(0, poll.maxVotes - picks.size)} votes remaining`}
                </Text>
                <Pressable
                  onPress={submitVotes}
                  disabled={busy || !changed || picks.size === 0}
                  className={`items-center rounded-skin py-3 ${
                    busy || !changed || picks.size === 0 ? 'bg-border' : 'bg-primary'
                  }`}>
                  <Text className="font-sans-semibold text-primary-ink">
                    {busy ? 'Submitting…' : alreadyVoted ? 'Update vote' : 'Submit vote'}
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        ) : (
          <View className="gap-2">
            {results.map((o) => (
              <Animated.View key={o.id} layout={LinearTransition}>
                <View className="gap-1.5 rounded-skin border-skin border-border bg-panel p-2">
                  <View className="flex-row items-center gap-3">
                    <Thumb images={o.bookmark.images} />
                    <Text className="flex-1 font-sans text-ink" numberOfLines={2}>
                      {o.bookmark.name}
                    </Text>
                    <Text className="font-sans-semibold text-ink">{o.votes.length}</Text>
                  </View>
                  <View className="h-1.5 overflow-hidden rounded-full bg-bg">
                    <View
                      style={{
                        width: `${(o.votes.length / maxCount) * 100}%`,
                        backgroundColor: t.primary,
                      }}
                      className="h-full rounded-full"
                    />
                  </View>
                  {o.votes.length > 0 &&
                    (poll.isAnonymous ? (
                      <Text className="font-sans text-xs text-muted">🔒 Anonymous</Text>
                    ) : (
                      <Text className="text-sm">
                        {o.votes.map((v) => v.user.icon ?? '🙂').join(' ')}
                      </Text>
                    ))}
                </View>
              </Animated.View>
            ))}
          </View>
        )}

        {canManage && (
          <View className="mt-2 flex-row gap-2">
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/polls/new',
                  params: { pollId: poll.id, listId: poll.listId },
                })
              }
              className="flex-1 items-center rounded-skin border-skin border-border py-3">
              <Text className="font-sans text-ink">Edit</Text>
            </Pressable>
            <Pressable
              onPress={confirmDelete}
              className="flex-1 items-center rounded-skin border-skin border-danger py-3">
              <Text className="font-sans text-danger">Delete</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
