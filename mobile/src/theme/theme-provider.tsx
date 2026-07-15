import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme, View } from 'react-native';
import { vars } from 'nativewind';
import * as SecureStore from 'expo-secure-store';

import { SHARED_KEYCHAIN_ACCESS_GROUP } from '@/client/bearer-store';
import { THEME_TOKENS, themeVars, type ThemeName } from './tokens';

type ThemeContextValue = {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORE_KEY = 'klect.theme';

/**
 * Mirror of the active theme in the **shared keychain access group** (same group as the bearer
 * token, see `client/bearer-store.ts`). The iOS Share Extension runs in a separate process that
 * can't read the app's private `klect.theme` item, so the app write-mirrors here and the extension
 * reads it to render the user's real theme. Additive — the app itself still uses `STORE_KEY`.
 */
export const SHARED_THEME_KEY = 'klect.theme.shared';
export const SHARED_THEME_OPTS = {
  accessGroup: SHARED_KEYCHAIN_ACCESS_GROUP,
} as const;

export function isThemeName(v: string | null): v is ThemeName {
  return v != null && v in THEME_TOKENS;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>');
  return ctx;
}

/**
 * Applies a Klect theme's tokens as CSS variables (via NativeWind `vars()`) to a
 * root wrapper, so `bg-bg` / `text-ink` / `bg-primary` resolve to the active
 * palette. Reproduces web's `data-theme` var-swap. Defaults to the Modern theme
 * following system light/dark; an explicit choice is persisted to secure-store so
 * it survives restarts.
 *
 * `initialTheme` seeds the theme directly (used by the Share Extension, which reads it from the
 * shared keychain and has no theme switcher). `mirrorToShared` makes the app write-mirror the
 * active theme into the shared keychain group so the extension can pick it up.
 */
export function ThemeProvider({
  children,
  initialTheme,
  mirrorToShared = false,
}: {
  children: ReactNode;
  initialTheme?: ThemeName;
  mirrorToShared?: boolean;
}) {
  const scheme = useColorScheme();
  const [override, setOverride] = useState<ThemeName | null>(initialTheme ?? null);

  // Restore a previously chosen theme. Skipped when seeded via `initialTheme` (the extension —
  // which also can't read the app's private keychain item anyway).
  useEffect(() => {
    if (initialTheme) return;
    SecureStore.getItemAsync(STORE_KEY).then((v) => {
      if (isThemeName(v)) setOverride(v);
    });
  }, [initialTheme]);

  const setTheme = useCallback((t: ThemeName) => {
    setOverride(t);
    SecureStore.setItemAsync(STORE_KEY, t).catch(() => {});
  }, []);

  const theme = override ?? (scheme === 'dark' ? 'MODERN_DARK' : 'MODERN_LIGHT');

  // Write-mirror the active theme into the shared keychain group (app only) so the Share
  // Extension's separate process can render in the user's real theme.
  useEffect(() => {
    if (!mirrorToShared) return;
    SecureStore.setItemAsync(SHARED_THEME_KEY, theme, SHARED_THEME_OPTS).catch(() => {});
  }, [theme, mirrorToShared]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <View style={vars(themeVars(theme))} className="flex-1 bg-bg">
        {children}
      </View>
    </ThemeContext.Provider>
  );
}
