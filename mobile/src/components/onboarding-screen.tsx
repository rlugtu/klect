import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { trpc } from '@/client/api';
import { toast } from '@/client/toast';
import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS, type ThemeName } from '@/theme/tokens';

// The exact input web's profile procedure accepts — no hand-written DTO. birthday is
// `z.coerce.date()` server-side, so an ISO string is accepted for the Date field.
type ProfileInput = Parameters<typeof trpc.profile.update.mutate>[0];

// Same avatar set as web's ProfileForm (web/src/components/profile/ProfileForm.tsx).
const ICON_CHOICES = ['🔖', '📚', '🎮', '🍜', '✈️', '🎬', '🎵', '💻', '🏠', '⭐'];

// Six themes, same labels/order as the Settings picker.
const THEME_LABELS: Record<ThemeName, string> = {
  JOURNAL_LIGHT: 'Journal · Light',
  JOURNAL_DARK: 'Journal · Dark',
  PIXEL_LIGHT: 'Pixel · Light',
  PIXEL_DARK: 'Pixel · Dark',
  MODERN_LIGHT: 'Modern · Light',
  MODERN_DARK: 'Modern · Dark',
};

// yyyy-mm-dd — matches web's date input format; anything else is treated as unset.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Public @handle format — mirrors web core's HANDLE_RE (lowercase a–z 0–9 _, 3–20).
const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

/**
 * First-run profile setup — the mobile analogue of web's onboarding (`/onboarding`
 * → ProfileForm). Shown by the root layout when a signed-in user has no handle
 * yet (the "onboarded" signal). Saves via the shared `profile.update` tRPC procedure,
 * then calls `onDone` so the layout refetches the session and advances into the app.
 *
 * Theme is applied locally (secure-store) via `setTheme` and also sent to the server as
 * a best-effort value; the server `Theme` enum only knows Pixel/Modern, so a Journal
 * pick is coerced to Pixel there (affects web only — mobile keeps the local theme).
 */
export default function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const { theme, setTheme } = useTheme();
  const muted = THEME_TOKENS[theme].muted;

  const [handle, setHandle] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthday, setBirthday] = useState('');
  const [icon, setIcon] = useState('🔖');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const normalizedHandle = handle.trim().toLowerCase().replace(/^@/, '');
    if (!HANDLE_RE.test(normalizedHandle)) {
      setError(
        'Handle must be 3–20 characters: lowercase letters, numbers, or underscores.',
      );
      return;
    }
    if (birthday.trim() && !DATE_RE.test(birthday.trim())) {
      setError('Birthday must be in YYYY-MM-DD format.');
      return;
    }
    setBusy(true);
    setError(null);
    const input: ProfileInput = {
      handle: normalizedHandle,
      firstName: firstName.trim() || null,
      lastName: lastName.trim() || null,
      birthday: birthday.trim() ? new Date(birthday.trim()) : null,
      icon,
      theme,
    };
    try {
      await trpc.profile.update.mutate(input);
      toast.success('Welcome to Klect 🎉');
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your profile.');
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }} className="bg-bg">
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16 }}
        keyboardShouldPersistTaps="handled">
        <View className="gap-1">
          <Text className="font-serif text-3xl text-primary">New Player</Text>
          <Text className="font-sans text-muted">
            Set up your profile to start saving.
          </Text>
        </View>

        <View className="gap-1.5">
          <Text className="font-sans-medium text-sm text-muted">Handle *</Text>
          <View className="flex-row items-center rounded-skin border-skin border-border px-4">
            <Text className="font-sans text-muted">@</Text>
            <TextInput
              className="flex-1 py-3 pl-1 font-sans text-ink"
              placeholder="player_one"
              placeholderTextColor={muted}
              autoCapitalize="none"
              autoCorrect={false}
              value={handle}
              onChangeText={setHandle}
            />
          </View>
          <Text className="font-sans text-xs text-muted">
            Lowercase letters, numbers, or underscores. 3–20 characters.
          </Text>
        </View>

        <View className="flex-row gap-2">
          <View className="flex-1 gap-1.5">
            <Text className="font-sans-medium text-sm text-muted">First name</Text>
            <TextInput
              className="rounded-skin border-skin border-border px-4 py-3 font-sans text-ink"
              placeholderTextColor={muted}
              value={firstName}
              onChangeText={setFirstName}
            />
          </View>
          <View className="flex-1 gap-1.5">
            <Text className="font-sans-medium text-sm text-muted">Last name</Text>
            <TextInput
              className="rounded-skin border-skin border-border px-4 py-3 font-sans text-ink"
              placeholderTextColor={muted}
              value={lastName}
              onChangeText={setLastName}
            />
          </View>
        </View>

        <View className="gap-1.5">
          <Text className="font-sans-medium text-sm text-muted">Birthday</Text>
          <TextInput
            className="rounded-skin border-skin border-border px-4 py-3 font-sans text-ink"
            placeholder="YYYY-MM-DD"
            placeholderTextColor={muted}
            autoCapitalize="none"
            autoCorrect={false}
            value={birthday}
            onChangeText={setBirthday}
          />
        </View>

        <View className="gap-2">
          <Text className="font-sans-medium text-sm text-muted">Avatar</Text>
          <View className="flex-row flex-wrap gap-2">
            {ICON_CHOICES.map((choice) => (
              <Pressable
                key={choice}
                onPress={() => setIcon(choice)}
                className={`h-11 w-11 items-center justify-center rounded-skin-sm border-skin bg-panel ${
                  icon === choice ? 'border-primary' : 'border-border'
                }`}>
                <Text className="text-xl">{choice}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View className="gap-2">
          <Text className="font-sans-medium text-sm text-muted">Theme</Text>
          {(Object.keys(THEME_LABELS) as ThemeName[]).map((name) => {
            const active = name === theme;
            const t = THEME_TOKENS[name];
            return (
              <Pressable
                key={name}
                onPress={() => setTheme(name)}
                className={`flex-row items-center justify-between rounded-skin border bg-panel p-3 ${
                  active ? 'border-primary' : 'border-border'
                }`}>
                <View className="flex-row items-center gap-3">
                  <View className="flex-row">
                    {[t.bg, t.primary, t.accent, t.ink].map((c, i) => (
                      <View
                        key={i}
                        style={{ backgroundColor: c }}
                        className="h-5 w-5 rounded-skin-sm"
                      />
                    ))}
                  </View>
                  <Text className="font-sans text-ink">{THEME_LABELS[name]}</Text>
                </View>
                {active && <Text className="text-primary">✓</Text>}
              </Pressable>
            );
          })}
        </View>

        {error && <Text className="font-sans text-danger">{error}</Text>}

        <Pressable
          className="items-center rounded-skin bg-primary py-3"
          disabled={busy}
          onPress={submit}>
          {busy ? (
            <ActivityIndicator color={THEME_TOKENS[theme].primaryInk} />
          ) : (
            <Text className="font-sans-semibold text-primary-ink">Enter Klect</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
