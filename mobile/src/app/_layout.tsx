import '@/global.css';

import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider as NavThemeProvider,
} from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme, View } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import LoginScreen from '@/components/login-screen';
import { authClient } from '@/client/auth';
import { ThemeProvider as AppThemeProvider } from '@/theme/theme-provider';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { data: session, isPending } = authClient.useSession();

  return (
    <AppThemeProvider>
      <NavThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        {isPending ? (
          <View style={{ flex: 1 }} />
        ) : session ? (
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="lists/[id]" options={{ title: 'List' }} />
            <Stack.Screen name="bookmarks/[id]" options={{ title: 'Bookmark' }} />
          </Stack>
        ) : (
          <LoginScreen />
        )}
      </NavThemeProvider>
    </AppThemeProvider>
  );
}
