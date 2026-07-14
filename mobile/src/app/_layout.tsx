import '@/global.css';

import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
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
import {
  Geist_400Regular,
  Geist_500Medium,
  Geist_500Medium_Italic,
  Geist_600SemiBold,
} from '@expo-google-fonts/geist';

import HeaderBlurBackground from '@/components/header-blur-background';
import LoginScreen from '@/components/login-screen';
import OnboardingScreen from '@/components/onboarding-screen';
import { authClient } from '@/client/auth';
import { ThemeProvider as AppThemeProvider, useTheme } from '@/theme/theme-provider';
import { fontFor, THEME_TOKENS } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();

/**
 * Routes an incoming share intent (a URL shared into Klect from another app) to the
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

/**
 * The authenticated navigation stack. Lives inside <AppThemeProvider> so it can read the active
 * palette and give every pushed screen a seamless "floating" header — the header shares the page
 * background (no black bar, no shadow) like the homepage, with a chevron-only back button.
 */
function AppStack() {
  const theme = useTheme().theme;
  const t = THEME_TOKENS[theme];
  // Modal sheets keep a solid header — only the full-screen pushed pages get the
  // frosted, content-scrolls-under treatment (they pad their content by the header
  // height; a modal card has no room to scroll under a translucent bar).
  const opaqueModal = {
    presentation: 'modal' as const,
    headerTransparent: false,
    headerBackground: undefined,
    headerStyle: { backgroundColor: t.bg },
  };
  // Full-screen pushed pages carry no centered title — the buttons float over the
  // gradient-blur bar and the page name lives in the scrolling content instead.
  const blankTitle = { headerTitle: () => null };
  return (
    <>
    {/* Translucent status bar so screens render under a frosted top bar. */}
    <StatusBar style={theme.endsWith('DARK') ? 'light' : 'dark'} translucent />
    <Stack
      screenOptions={{
        // Frosted glass header shared with the tab screens' floating status bar, so a
        // pushed page's top bar matches the home page. Content scrolls under it — each
        // full-screen screen pads its scroll container by the header height.
        headerTransparent: true,
        headerBackground: () => <HeaderBlurBackground />,
        headerShadowVisible: false,
        headerTintColor: t.primary,
        headerTitleStyle: { fontFamily: fontFor(theme).title, color: t.ink },
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: t.bg },
      }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="lists/[id]" options={{ ...blankTitle }} />
      <Stack.Screen name="lists/members" options={{ ...blankTitle }} />
      <Stack.Screen
        name="lists/new"
        options={{ ...opaqueModal, title: 'New list' }}
      />
      <Stack.Screen
        name="lists/edit"
        options={{ ...opaqueModal, title: 'Edit list' }}
      />
      <Stack.Screen name="bookmarks/[id]" options={{ ...blankTitle }} />
      <Stack.Screen
        name="bookmarks/new"
        options={{ ...opaqueModal, title: 'New bookmark' }}
      />
      <Stack.Screen
        name="bookmarks/edit"
        options={{ ...opaqueModal, title: 'Edit bookmark' }}
      />
      <Stack.Screen name="polls/index" options={{ ...blankTitle }} />
      <Stack.Screen
        name="polls/new"
        options={{ ...opaqueModal, title: 'New poll' }}
      />
      <Stack.Screen name="polls/[pollId]" options={{ ...blankTitle }} />
      <Stack.Screen name="users/[id]" options={{ ...blankTitle }} />
      <Stack.Screen name="settings" options={{ ...blankTitle }} />
      <Stack.Screen name="requests" options={{ ...blankTitle }} />
      <Stack.Screen name="friend-requests" options={{ ...blankTitle }} />
      <Stack.Screen name="pending-requests" options={{ ...blankTitle }} />
    </Stack>
    </>
  );
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
    // Modern theme (per-theme font vars in theme/tokens.ts select these).
    Geist_400Regular,
    Geist_500Medium,
    Geist_500Medium_Italic,
    Geist_600SemiBold,
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
              <AppStack />
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
