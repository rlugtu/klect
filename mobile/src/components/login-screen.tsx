import { useEffect, useState } from 'react';
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
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';

import { authClient, clearBearerToken } from '@/client/auth';
import { API_URL } from '@/client/bearer-store';
import { useTheme } from '@/theme/theme-provider';
import { radiusFor, THEME_TOKENS } from '@/theme/tokens';

type Mode = 'signin' | 'signup';

/** expo-apple-authentication rejects with this CodedError when the user dismisses the sheet. */
function isAppleCancel(e: unknown) {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    e.code === 'ERR_REQUEST_CANCELED'
  );
}

/**
 * Sign-in / sign-up against web's better-auth server. Email/password works out of the
 * box (sign-up mirrors web's `LoginForm`: name + email + password ≥ 8); Google uses the
 * social flow (needs a native OAuth client id configured — see DESIGN.md / mobile setup
 * notes); Apple is iOS-only and native, via `expo-apple-authentication`. New accounts have
 * no handle yet, so the root layout routes them to onboarding. Styled with the shared
 * Klect tokens.
 */
export default function LoginScreen() {
  const { theme } = useTheme();
  const muted = THEME_TOKENS[theme].muted;

  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appleReady, setAppleReady] = useState(false);

  // Sign in with Apple needs iOS *and* a new-enough OS, and `isAvailableAsync` is the only
  // way to know. Gate on it before rendering: Apple's own component renders nothing when
  // unavailable, which would leave a dead gap in the stack instead of a missing row.
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let live = true;
    AppleAuthentication.isAvailableAsync().then(
      (ok) => {
        if (live) setAppleReady(ok);
      },
      // A missing native module means "no Apple button", not a broken login screen.
      // Email/password and Google still work.
      () => {
        if (live) setAppleReady(false);
      },
    );
    return () => {
      live = false;
    };
  }, []);

  async function submitCredentials() {
    if (mode === 'signup') {
      if (!name.trim()) {
        setError('Name is required.');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters.');
        return;
      }
    }
    setBusy(true);
    setError(null);
    // Start from a clean slate: drop any stale bearer token so this sign-in's fresh token
    // (set-auth-token header for email/password) wins instead of a dead cached one.
    clearBearerToken();
    const res =
      mode === 'signin'
        ? await authClient.signIn.email({ email: email.trim(), password })
        : await authClient.signUp.email({
            email: email.trim(),
            password,
            name: name.trim(),
          });
    if (res.error) {
      setError(res.error.message ?? 'Something went wrong.');
    }
    setBusy(false);
  }

  async function signInGoogle() {
    setBusy(true);
    setError(null);
    // Start from a clean slate: drop any stale bearer token so resolveBearerToken() reads this
    // sign-in's fresh OAuth cookie instead of short-circuiting on a dead cached token (the lockout).
    clearBearerToken();
    try {
      await authClient.signIn.social({ provider: 'google', callbackURL: '/' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Google sign-in failed.');
    }
    setBusy(false);
  }

  /**
   * Native Sign in with Apple. Unlike Google this never leaves the app: Apple's sheet returns an
   * identity token, which better-auth verifies server-side against the bundle id (see
   * `web/src/lib/auth.ts`). Because it's a plain fetch the response carries `set-auth-token`, so
   * the bearer token lands through `fetchOptions.onSuccess` rather than the OAuth cookie.
   *
   * No `nonce` on purpose: better-auth checks the token's nonce claim against the nonce the
   * *client* sends in the same request, with nothing stored server-side, so a replayed token
   * would carry a matching nonce anyway. It would add a CSPRNG dependency for no real
   * protection. Revisit if better-auth ever issues and stores the nonce itself.
   */
  async function signInApple() {
    setBusy(true);
    setError(null);
    // Same reason as Google: drop any stale bearer token so this sign-in's fresh one wins.
    clearBearerToken();
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        setError('Apple did not return an identity token.');
        setBusy(false);
        return;
      }
      const res = await authClient.signIn.social({
        provider: 'apple',
        idToken: {
          token: credential.identityToken,
          // Apple's identity token has no name claim, and `fullName` is only populated on the
          // user's very first authorization, so forward it now or the account is created with
          // an empty name. The server only reads it when creating the user.
          user: {
            name: {
              firstName: credential.fullName?.givenName ?? undefined,
              lastName: credential.fullName?.familyName ?? undefined,
            },
            email: credential.email ?? undefined,
          },
        },
      });
      if (res.error) {
        setError(res.error.message ?? 'Apple sign-in failed.');
      }
    } catch (e) {
      if (!isAppleCancel(e)) {
        setError(e instanceof Error ? e.message : 'Apple sign-in failed.');
      }
    }
    setBusy(false);
  }

  return (
    <SafeAreaView style={{ flex: 1 }} className="bg-bg">
      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
        <View className="gap-3 px-6">
          {/* `font-serif`, not `font-bold`: RN doesn't synthesize weights, so a bare
              fontWeight utility with no family drops the wordmark to the system font. */}
          <Text className="text-center font-serif text-3xl text-ink">Klect</Text>
          <Text className="mb-4 text-center text-muted">
            {mode === 'signin'
              ? 'Sign in to your bookmarks'
              : 'Create your bookmarks account'}
          </Text>

          {mode === 'signup' && (
            <TextInput
              className="rounded-skin border-skin border-border px-4 py-3 text-ink"
              placeholder="Name"
              placeholderTextColor={muted}
              autoCapitalize="words"
              value={name}
              onChangeText={setName}
            />
          )}

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
            accessibilityRole="button"
            accessibilityLabel={mode === 'signin' ? 'Sign in' : 'Create account'}
            className="items-center rounded-skin bg-primary py-3"
            disabled={busy}
            onPress={submitCredentials}>
            {busy ? (
              <ActivityIndicator color={THEME_TOKENS[theme].primaryInk} />
            ) : (
              <Text className="font-sans-semibold text-primary-ink">
                {mode === 'signin' ? 'Sign in' : 'Create account'}
              </Text>
            )}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continue with Google"
            className="items-center rounded-skin border-skin border-border py-3"
            disabled={busy}
            onPress={signInGoogle}>
            <Text className="font-sans-semibold text-ink">Continue with Google</Text>
          </Pressable>

          {/* Apple's own component, not a styled Pressable: App Store review requires it, and it
              rejects `backgroundColor`/`borderRadius` in `style` (hence `cornerRadius`, and an
              explicit height, or it renders at zero). `buttonStyle` is the only colour control, so
              it tracks the theme's light/dark half rather than its palette. Shown in both modes
              like Google's: "Continue with" works for a new and a returning user alike. */}
          {appleReady && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={
                theme.endsWith('DARK')
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={radiusFor(theme)}
              style={{ height: 44 }}
              // The component takes ViewProps, so there's no `disabled` to mirror the other
              // buttons' `disabled={busy}` with.
              pointerEvents={busy ? 'none' : 'auto'}
              onPress={signInApple}
            />
          )}

          {/* Reset is a web flow on purpose: the user has to click a link in their email
              client, so there's nothing for a native screen to own. Opens web's
              /forgot-password in an in-app browser, same as Terms/Privacy below. */}
          {mode === 'signin' && (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Forgot password, opens in a browser"
              className="items-center py-1"
              onPress={() => WebBrowser.openBrowserAsync(`${API_URL}/forgot-password`)}>
              <Text className="text-sm text-muted">Forgot password?</Text>
            </Pressable>
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              mode === 'signin'
                ? 'New here? Create an account'
                : 'Already have an account? Sign in'
            }
            className="items-center py-1"
            onPress={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin');
              setError(null);
            }}>
            <Text className="text-sm text-muted">
              {mode === 'signin'
                ? 'New here? Create an account'
                : 'Already have an account? Sign in'}
            </Text>
          </Pressable>

          <Text className="mt-1 text-center text-xs text-muted">
            By continuing you agree to our{' '}
            <Text
              accessibilityRole="link"
              accessibilityLabel="Terms of Use, opens in a browser"
              className="text-primary underline"
              onPress={() => WebBrowser.openBrowserAsync(`${API_URL}/terms`)}>
              Terms of Use
            </Text>{' '}
            and{' '}
            <Text
              accessibilityRole="link"
              accessibilityLabel="Privacy Policy, opens in a browser"
              className="text-primary underline"
              onPress={() => WebBrowser.openBrowserAsync(`${API_URL}/privacy`)}>
              Privacy Policy
            </Text>
            .
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
