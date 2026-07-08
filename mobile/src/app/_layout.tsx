import '@/global.css';

import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import {
  ShareIntentProvider,
  useShareIntentContext,
} from 'expo-share-intent';
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavThemeProvider,
} from '@react-navigation/native';
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

import LoginScreen from '@/components/login-screen';
import OnboardingScreen from '@/components/onboarding-screen';
import { authClient } from '@/client/auth';
import { ThemeProvider as AppThemeProvider } from '@/theme/theme-provider';

SplashScreen.preventAutoHideAsync();

/**
 * Routes an incoming share intent (a URL shared into Saive from another app) to the
 * standalone new-bookmark flow, prefilled with the shared URL. Rendered only inside the
 * authenticated subtree, so a share received while logged out waits until after login.
 */
function ShareIntentRouter() {
  const router = useRouter();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();

  useEffect(() => {
    if (!hasShareIntent) return;
    const url = shareIntent.webUrl ?? shareIntent.text ?? undefined;
    if (url) router.push({ pathname: '/bookmarks/new', params: { url } });
    resetShareIntent();
  }, [hasShareIntent, shareIntent, router, resetShareIntent]);

  return null;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { data: session, isPending, refetch } = authClient.useSession();
  const [fontsLoaded] = useFonts({
    Newsreader_600SemiBold,
    Newsreader_500Medium_Italic,
    WorkSans_400Regular,
    WorkSans_500Medium,
    WorkSans_600SemiBold,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  // Keep the native splash up until the Journal fonts are ready.
  if (!fontsLoaded) return null;

  return (
    <ShareIntentProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
      <AppThemeProvider>
        <NavThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <BottomSheetModalProvider>
            {isPending ? (
              <View style={{ flex: 1 }} />
            ) : !session ? (
              <LoginScreen />
            ) : !session.user.displayName ? (
              // Signed in but no profile yet — mirror web's onboarding gate.
              <OnboardingScreen
                defaultName={session.user.name}
                onDone={() => refetch()}
              />
            ) : (
              <>
              <Stack
                screenOptions={{
                  headerTitleStyle: { fontFamily: 'Newsreader_600SemiBold' },
                }}>
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
                <Stack.Screen name="polls/index" options={{ title: 'Polls' }} />
                <Stack.Screen
                  name="polls/new"
                  options={{ presentation: 'modal', title: 'New poll' }}
                />
                <Stack.Screen name="polls/[pollId]" options={{ title: 'Poll' }} />
              </Stack>
              <ShareIntentRouter />
              </>
            )}
          </BottomSheetModalProvider>
        </NavThemeProvider>
      </AppThemeProvider>
    </GestureHandlerRootView>
    </ShareIntentProvider>
  );
}
