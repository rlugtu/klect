import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';

import { trpc } from '@/client/api';
import { authClient, clearBearerToken } from '@/client/auth';
import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';

/**
 * Permanently delete the signed-in user's account. Deleting is irreversible, so the button is
 * gated behind a type-to-confirm step — the user must type their exact @handle before it enables.
 * On success we clear the stored bearer token and sign out; the root layout's session gate then
 * returns the user to the login screen.
 */
export default function DeleteAccountScreen() {
  const { theme } = useTheme();
  const t = THEME_TOKENS[theme];
  const headerHeight = useHeaderHeight();
  const { data: session } = authClient.useSession();
  const handle = session?.user?.handle ?? '';

  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const confirmed = value.trim().toLowerCase() === handle.toLowerCase() && handle.length > 0;

  async function onDelete() {
    if (!confirmed || busy) return;
    setBusy(true);
    try {
      await trpc.account.delete.mutate();
      // Sign out (clears the expo cookie store) before wiping the local bearer, matching the
      // settings sign-out order so there's one teardown mental model.
      await authClient.signOut();
      clearBearerToken();
      // Root layout re-reads the (now empty) session and shows the login screen.
    } catch (e) {
      setBusy(false);
      Alert.alert('Could not delete account', e instanceof Error ? e.message : 'Please try again.');
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['left', 'right']} className="bg-bg">
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingTop: headerHeight + 8,
          paddingBottom: 40,
          gap: 20,
        }}>
        <View className="gap-2">
          <Text className="font-serif text-3xl text-danger">Delete account</Text>
          <Text className="text-base text-muted">
            This permanently deletes your account and everything you own — your profile, lists,
            bookmarks, comments, polls, tags, friends, and messages. This cannot be undone.
          </Text>
        </View>

        <View className="gap-2">
          <Text className="text-sm text-muted">
            Type your handle <Text className="text-ink">@{handle}</Text> to confirm.
          </Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder={`@${handle}`}
            placeholderTextColor={t.muted}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            editable={!busy}
            className="rounded-skin border-skin border-border bg-panel p-3 text-base text-ink"
          />
        </View>

        <Pressable
          onPress={onDelete}
          disabled={!confirmed || busy}
          style={{ backgroundColor: t.danger, opacity: !confirmed || busy ? 0.5 : 1 }}
          className="flex-row items-center justify-center gap-2 rounded-skin p-3">
          {busy && <ActivityIndicator color={t.primaryInk} size="small" />}
          <Text style={{ color: t.primaryInk }} className="font-sans-semibold text-base">
            {busy ? 'Deleting…' : 'Delete my account'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
