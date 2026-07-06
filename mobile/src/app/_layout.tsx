import '@/global.css';

import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider as NavThemeProvider,
} from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { useFonts } from 'expo-font';
import {
  Newsreader_500Medium_Italic,
  Newsreader_600SemiBold,
} from '@expo-google-fonts/newsreader';
import {
  WorkSans_400Regular,
  WorkSans_500Medium,
  WorkSans_600SemiBold,
} from '@expo-google-fonts/work-sans';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import LoginScreen from '@/components/login-screen';
import { authClient } from '@/client/auth';
import { ThemeProvider as AppThemeProvider } from '@/theme/theme-provider';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { data: session, isPending } = authClient.useSession();
  const [fontsLoaded] = useFonts({
    Newsreader_600SemiBold,
    Newsreader_500Medium_Italic,
    WorkSans_400Regular,
    WorkSans_500Medium,
    WorkSans_600SemiBold,
  });

  // Keep the native splash up until the Journal fonts are ready.
  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppThemeProvider>
        <NavThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <BottomSheetModalProvider>
            <AnimatedSplashOverlay />
            {isPending ? (
              <View style={{ flex: 1 }} />
            ) : session ? (
              <Stack>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="lists/[id]" options={{ title: 'List' }} />
                <Stack.Screen name="lists/members" options={{ title: 'Members' }} />
                <Stack.Screen
                  name="lists/new"
                  options={{ presentation: 'modal', title: 'New list' }}
                />
                <Stack.Screen
                  name="lists/edit"
                  options={{ presentation: 'modal', title: 'Edit list' }}
                />
                <Stack.Screen name="bookmarks/[id]" options={{ title: 'Bookmark' }} />
                <Stack.Screen
                  name="bookmarks/new"
                  options={{ presentation: 'modal', title: 'New bookmark' }}
                />
                <Stack.Screen
                  name="bookmarks/edit"
                  options={{ presentation: 'modal', title: 'Edit bookmark' }}
                />
              </Stack>
            ) : (
              <LoginScreen />
            )}
          </BottomSheetModalProvider>
        </NavThemeProvider>
      </AppThemeProvider>
    </GestureHandlerRootView>
  );
}
