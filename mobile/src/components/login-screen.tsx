import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { authClient } from '@/client/auth';
import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';

/**
 * Sign-in against web's better-auth server. Email/password works out of the box;
 * Google uses the social flow (needs a native OAuth client id configured — see
 * DESIGN.md / mobile setup notes). Styled with the shared Saive tokens.
 */
export default function LoginScreen() {
  const { theme } = useTheme();
  const muted = THEME_TOKENS[theme].muted;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signInEmail() {
    setBusy(true);
    setError(null);
    const res = await authClient.signIn.email({ email: email.trim(), password });
    if (res.error) setError(res.error.message ?? 'Sign in failed.');
    setBusy(false);
  }

  async function signInGoogle() {
    setBusy(true);
    setError(null);
    try {
      await authClient.signIn.social({ provider: 'google', callbackURL: '/' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Google sign-in failed.');
    }
    setBusy(false);
  }

  return (
    <SafeAreaView style={{ flex: 1 }} className="bg-bg">
      <View className="flex-1 justify-center gap-3 px-6">
        <Text className="text-center text-3xl font-bold text-ink">Saive</Text>
        <Text className="mb-4 text-center text-muted">Sign in to your bookmarks</Text>

        <TextInput
          className="rounded-skin border-skin border-border px-4 py-3 text-ink"
          placeholder="Email"
          placeholderTextColor={muted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          className="rounded-skin border-skin border-border px-4 py-3 text-ink"
          placeholder="Password"
          placeholderTextColor={muted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        {error && <Text className="text-center text-danger">{error}</Text>}

        <Pressable
          className="items-center rounded-skin bg-primary py-3"
          disabled={busy}
          onPress={signInEmail}>
          {busy ? (
            <ActivityIndicator color={THEME_TOKENS[theme].primaryInk} />
          ) : (
            <Text className="font-semibold text-primary-ink">Sign in</Text>
          )}
        </Pressable>

        <Pressable
          className="items-center rounded-skin border-skin border-border py-3"
          disabled={busy}
          onPress={signInGoogle}>
          <Text className="font-semibold text-ink">Continue with Google</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
