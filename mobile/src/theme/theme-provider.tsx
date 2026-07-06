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

import { THEME_TOKENS, themeVars, type ThemeName } from './tokens';

type ThemeContextValue = {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORE_KEY = 'saive.theme';

function isTheme(v: string | null): v is ThemeName {
  return v != null && v in THEME_TOKENS;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>');
  return ctx;
}

/**
 * Applies a Saive theme's tokens as CSS variables (via NativeWind `vars()`) to a
 * root wrapper, so `bg-bg` / `text-ink` / `bg-primary` resolve to the active
 * palette. Reproduces web's `data-theme` var-swap. Defaults to the pixel theme
 * following system light/dark; an explicit choice is persisted to secure-store so
 * it survives restarts.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const [override, setOverride] = useState<ThemeName | null>(null);

  // Restore a previously chosen theme.
  useEffect(() => {
    SecureStore.getItemAsync(STORE_KEY).then((v) => {
      if (isTheme(v)) setOverride(v);
    });
  }, []);

  const setTheme = useCallback((t: ThemeName) => {
    setOverride(t);
    SecureStore.setItemAsync(STORE_KEY, t).catch(() => {});
  }, []);

  const theme = override ?? (scheme === 'dark' ? 'PIXEL_DARK' : 'PIXEL_LIGHT');

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <View style={vars(themeVars(theme))} className="flex-1 bg-bg">
        {children}
      </View>
    </ThemeContext.Provider>
  );
}
