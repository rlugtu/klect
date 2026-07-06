import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { trpc } from '@/client/api';
import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';

// Element type of the comments a read procedure returns (bookmark + list share it).
export type CommentItem = Awaited<
  ReturnType<typeof trpc.comments.forBookmark.query>
>[number];

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
          className="flex-1 rounded-lg border border-border px-4 py-2 text-ink"
          placeholder="Add a comment"
          placeholderTextColor={muted}
          value={value}
          onChangeText={setValue}
        />
        <Pressable
          className="items-center justify-center rounded-lg bg-primary px-4"
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
          className="flex-row items-start justify-between rounded-xl border border-border bg-panel p-3">
          <View className="flex-1 pr-2">
            <Text className="text-sm font-semibold text-ink">
              {c.author.icon ? `${c.author.icon} ` : ''}
              {c.author.displayName ?? c.author.name}
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
