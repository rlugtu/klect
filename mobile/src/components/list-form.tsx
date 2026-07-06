import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';

export type ListValues = { name: string; description: string; icon: string };

type Props = {
  initial: ListValues;
  submitLabel: string;
  onSubmit: (values: ListValues) => Promise<void>;
};

/** Reusable list editor (icon, name, description) for create + edit. */
export default function ListForm({ initial, submitLabel, onSubmit }: Props) {
  const { theme } = useTheme();
  const muted = THEME_TOKENS[theme].muted;

  const [name, setName] = useState(initial.name);
  const [icon, setIcon] = useState(initial.icon);
  const [description, setDescription] = useState(initial.description);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim(),
        icon: icon.trim() || '📁',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
      setBusy(false);
    }
  }

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerStyle={{ padding: 16, gap: 12 }}
      keyboardShouldPersistTaps="handled">
      <View className="flex-row gap-2">
        <TextInput
          className="w-16 rounded-skin border-skin border-border px-2 py-3 text-center text-ink"
          placeholder="📁"
          placeholderTextColor={muted}
          value={icon}
          onChangeText={setIcon}
        />
        <TextInput
          className="flex-1 rounded-skin border-skin border-border px-4 py-3 text-ink"
          placeholder="List name"
          placeholderTextColor={muted}
          value={name}
          onChangeText={setName}
        />
      </View>
      <TextInput
        className="rounded-skin border-skin border-border px-4 py-3 text-ink"
        placeholder="Description"
        placeholderTextColor={muted}
        multiline
        value={description}
        onChangeText={setDescription}
      />

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
  );
}
