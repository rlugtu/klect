import { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';

import { trpc } from '@/client/api';
import { toast, errorMessage } from '@/client/toast';
import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';

const CATEGORIES = [
  { value: 'idea', label: '💡 Idea' },
  { value: 'bug', label: '🐛 Bug' },
  { value: 'other', label: '💬 Other' },
] as const;

/**
 * Send app feedback (Settings → Feedback). A category chip + a free-text box,
 * submitted to `feedback.submit` with the platform + app version attached.
 */
export default function FeedbackScreen() {
  const { theme } = useTheme();
  const t = THEME_TOKENS[theme];
  const headerHeight = useHeaderHeight();
  const router = useRouter();

  const [category, setCategory] = useState<string>('idea');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const canSend = message.trim().length > 0 && !busy;

  async function onSubmit() {
    if (!canSend) return;
    setBusy(true);
    try {
      await trpc.feedback.submit.mutate({
        category,
        message: message.trim(),
        platform: Platform.OS,
        appVersion: Constants.expoConfig?.version ?? undefined,
      });
      toast.success('Thanks for the feedback!');
      router.back();
    } catch (e) {
      setBusy(false);
      toast.error(errorMessage(e, 'Could not send feedback'));
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['left', 'right']} className="bg-bg">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{
          padding: 16,
          paddingTop: headerHeight + 8,
          paddingBottom: 40,
          gap: 20,
        }}>
        <View className="gap-2">
          <Text className="font-serif text-3xl text-ink">Send feedback</Text>
          <Text className="text-base text-muted">
            Found a bug or have an idea? Tell us — every note helps make Klect
            better.
          </Text>
        </View>

        <View className="gap-2">
          <Text className="text-sm uppercase text-muted">Type</Text>
          <View className="flex-row gap-2">
            {CATEGORIES.map((c) => {
              const active = c.value === category;
              return (
                <Pressable
                  key={c.value}
                  onPress={() => setCategory(c.value)}
                  className={`flex-1 items-center rounded-skin border bg-panel p-3 ${
                    active ? 'border-primary' : 'border-border'
                  }`}>
                  <Text
                    className={`text-base ${active ? 'text-ink' : 'text-muted'}`}>
                    {c.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="gap-2">
          <Text className="text-sm uppercase text-muted">Message</Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="What's on your mind?"
            placeholderTextColor={t.muted}
            multiline
            maxLength={2000}
            editable={!busy}
            style={{ minHeight: 140, textAlignVertical: 'top' }}
            className="rounded-skin border-skin border-border bg-panel p-3 text-base text-ink"
          />
        </View>

        <Pressable
          onPress={onSubmit}
          disabled={!canSend}
          style={{ opacity: canSend ? 1 : 0.5 }}
          className="flex-row items-center justify-center gap-2 rounded-skin bg-primary p-3">
          {busy && <ActivityIndicator color={t.primaryInk} size="small" />}
          <Text className="font-sans-semibold text-base text-primary-ink">
            {busy ? 'Sending…' : 'Send feedback'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
