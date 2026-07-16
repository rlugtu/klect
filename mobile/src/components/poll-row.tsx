import { Pressable, Text, View } from 'react-native';

import { atHandle } from '@/lib/handle';
import { pollStatus } from '@/lib/poll-status';

/** Structural shape of a poll list row (from `trpc.polls.forList`). */
export type PollRowData = {
  id: string;
  name: string;
  startAt: string;
  endAt: string | null;
  creator: { handle: string | null; icon: string | null };
  _count: { options: number };
};

/**
 * A single poll card in a list of polls. Shared between the standalone
 * `/polls` route and the inline Polls tab on the list screen.
 */
export default function PollRow({
  poll,
  onPress,
}: {
  poll: PollRowData;
  onPress: () => void;
}) {
  const creator = atHandle(poll.creator.handle);
  return (
    <Pressable
      onPress={onPress}
      className="rounded-skin border-skin border-border bg-panel p-4">
      <Text className="font-serif text-lg text-ink">{poll.name}</Text>
      <View className="mt-1 flex-row items-center justify-between">
        <Text className="font-sans text-sm text-muted">
          {poll.creator.icon ? `${poll.creator.icon} ` : ''}
          {creator} · {poll._count.options} options
        </Text>
        <Text className="font-sans-medium text-xs text-primary">
          {pollStatus(poll.startAt, poll.endAt)}
        </Text>
      </View>
    </Pressable>
  );
}
