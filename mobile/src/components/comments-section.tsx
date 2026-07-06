import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { trpc } from '@/client/api';
import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';

// Element type of the comments a read procedure returns (bookmark + list share it).
export type CommentItem = Awaited<
  ReturnType<typeof trpc.comments.forBookmark.query>
>[number];

/** Compact relative time. `createdAt` arrives as an ISO string over tRPC. */
function timeAgo(value: Date | string): string {
  const then = new Date(value).getTime();
  const s = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (s < 60) return 'now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(value).toLocaleDateString();
}

type Props = {
  comments: CommentItem[];
  onAdd: (value: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

export default function CommentsSection({ comments, onAdd, onDelete }: Props) {
  const { theme } = useTheme();
  const muted = THEME_TOKENS[theme].muted;
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  async function post() {
    const v = value.trim();
    if (!v) return;
    setBusy(true);
    try {
      await onAdd(v);
      setValue('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="gap-2">
      <Text className="text-sm uppercase text-muted">
        Comments ({comments.length})
      </Text>

      <View className="flex-row gap-2">
        <TextInput
          className="flex-1 rounded-skin border-skin border-border px-4 py-2 text-ink"
          placeholder="Add a comment"
          placeholderTextColor={muted}
          value={value}
          onChangeText={setValue}
        />
        <Pressable
          className="items-center justify-center rounded-skin bg-primary px-4"
          disabled={busy}
          onPress={post}>
          {busy ? (
            <ActivityIndicator color={THEME_TOKENS[theme].primaryInk} />
          ) : (
            <Text className="font-semibold text-primary-ink">Post</Text>
          )}
        </Pressable>
      </View>

      {comments.map((c) => (
        <View
          key={c.id}
          className="flex-row items-start justify-between rounded-skin border-skin border-border bg-panel p-3">
          <View className="flex-1 pr-2">
            <Text className="text-sm font-semibold text-ink">
              {c.author.icon ? `${c.author.icon} ` : ''}
              {c.author.displayName ?? c.author.name}
              <Text className="font-normal text-muted"> · {timeAgo(c.createdAt)}</Text>
            </Text>
            <Text className="text-sm text-ink">{c.value}</Text>
          </View>
          <Pressable onPress={() => onDelete(c.id)} hitSlop={8}>
            <Text className="text-muted">✕</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}
