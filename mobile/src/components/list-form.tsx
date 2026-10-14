import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';

export type ListValues = {
  name: string;
  description: string;
  icon: string;
  isPublic: boolean;
};

/** Picker options, in the same style as onboarding's avatar grid. */
const ICON_CHOICES = ['📁', '📍', '🍜', '☕', '🎬', '📚', '🛍️', '✈️', '🎵', '⭐'];

type Props = {
  initial: ListValues;
  submitLabel: string;
  onSubmit: (values: ListValues) => Promise<void>;
  /** When set, a destructive "Delete list" button is shown (edit only). */
  onDelete?: () => void;
  /** Show the public/private toggle (create flow only). */
  showVisibility?: boolean;
};

/** Reusable list editor (icon, name, description) for create + edit. */
export default function ListForm({
  initial,
  submitLabel,
  onSubmit,
  onDelete,
  showVisibility = false,
}: Props) {
  const { theme } = useTheme();
  const t = THEME_TOKENS[theme];
  const muted = t.muted;

  const [name, setName] = useState(initial.name);
  const [icon, setIcon] = useState(initial.icon);
  const [description, setDescription] = useState(initial.description);
  const [isPublic, setIsPublic] = useState(initial.isPublic);
  // An existing icon that isn't in the grid can only be edited in the text field, so
  // reveal it up front rather than making the user hunt for the "custom" option.
  const [customIcon, setCustomIcon] = useState(
    initial.icon !== '' && !ICON_CHOICES.includes(initial.icon),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only the edit screen passes a delete handler, so it doubles as the mode signal.
  const isEdit = onDelete !== undefined;
  // An empty icon saves as 📁 (see submit), so show that as the picked one.
  const pickedIcon = icon.trim() === '' ? '📁' : icon;

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
        isPublic,
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
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets>
      <Text className="font-serif text-3xl text-ink">
        {isEdit ? 'Edit list' : 'New list'}
      </Text>

      <View className="gap-2">
        <Text className="font-sans-medium text-sm text-muted">Icon</Text>
        <View className="flex-row flex-wrap gap-2">
          {ICON_CHOICES.map((choice) => (
            <Pressable
              key={choice}
              accessibilityRole="button"
              accessibilityLabel={`Icon ${choice}`}
              accessibilityState={{ selected: !customIcon && pickedIcon === choice }}
              onPress={() => {
                setIcon(choice);
                setCustomIcon(false);
              }}
              className={`h-11 w-11 items-center justify-center rounded-skin-sm border-skin bg-panel ${
                !customIcon && pickedIcon === choice ? 'border-primary' : 'border-border'
              }`}>
              <Text className="text-xl">{choice}</Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Use a custom emoji"
            accessibilityState={{ selected: customIcon }}
            onPress={() => setCustomIcon(true)}
            className={`h-11 items-center justify-center rounded-skin-sm border-skin bg-panel px-3 ${
              customIcon ? 'border-primary' : 'border-border'
            }`}>
            <Text className="font-sans text-sm text-muted">Custom</Text>
          </Pressable>
        </View>
        {customIcon && (
          <TextInput
            className="w-16 rounded-skin border-skin border-border px-2 py-3 text-center text-ink"
            placeholder="📁"
            placeholderTextColor={muted}
            value={icon}
            onChangeText={setIcon}
          />
        )}
      </View>

      <TextInput
        className="rounded-skin border-skin border-border px-4 py-3 text-ink"
        placeholder="List name"
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

      {showVisibility && (
        <View className="flex-row items-center justify-between rounded-skin border-skin border-border px-4 py-3">
          <View className="flex-1 pr-3">
            <Text className="font-sans-medium text-ink">Public list</Text>
            <Text className="font-sans text-xs text-muted">
              Anyone can view it (read-only) and it shows on your profile.
            </Text>
          </View>
          <Switch
            accessibilityLabel="Public list"
            value={isPublic}
            onValueChange={setIsPublic}
            trackColor={{ true: t.primary }}
          />
        </View>
      )}

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

      {onDelete && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Delete list"
          className="mt-4 items-center rounded-skin border-skin border-border py-3"
          disabled={busy}
          onPress={onDelete}>
          <Text className="font-semibold text-danger">Delete list</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}
