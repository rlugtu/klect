import '@/global.css';

import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
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
import ShareNudgePopup from '@/components/share-nudge-popup';
import ToastHost from '@/components/toast/ToastHost';
import { authClient } from '@/client/auth';
import { registerForPushNotificationsAsync } from '@/client/push';
import { ThemeProvider as AppThemeProvider, useTheme } from '@/theme/theme-provider';
import { fontFor, THEME_TOKENS } from '@/theme/tokens';

/** Navigate to a notification's deep-link target, if it carries a `route`. */
function routeFromNotification(
  response: Notifications.NotificationResponse | null,
  go: (path: string) => void,
) {
  const route = response?.notification.request.content.data?.route;
  if (typeof route === 'string' && route.startsWith('/')) go(route);
}

SplashScreen.preventAutoHideAsync();

/**
 * The authenticated navigation stack. Lives inside <AppThemeProvider> so it can read the active
 * palette and give every pushed screen a seamless "floating" header — the header shares the page
 * background (no black bar, no shadow) like the homepage, with a chevron-only back button.
 */
function AppStack() {
  const theme = useTheme().theme;
  const t = THEME_TOKENS[theme];
  const router = useRouter();
  // The most recent notification tap — covers both cold start (app killed) and warm taps.
  const lastResponse = Notifications.useLastNotificationResponse();

  // Register this device for push once the user is signed in with a handle (this component
  // only mounts in that state).
  useEffect(() => {
    registerForPushNotificationsAsync();
  }, []);

  // Deep-link to a tapped notification's target route.
  useEffect(() => {
    routeFromNotification(lastResponse ?? null, (path) =>
      router.push(path as never),
    );
  }, [lastResponse, router]);
  // No page shows a centered header title — the page name lives in the scrolling
  // content instead. This blank title applies everywhere (pushed pages AND modals).
  const blankTitle = { headerTitle: '' };
  // Modal sheets keep a solid header (for the floating back/close chevron) — only the
  // full-screen pushed pages get the frosted, content-scrolls-under treatment (they
  // pad their content by the header height; a modal card has no room to scroll under a
  // translucent bar). Titleless like everything else.
  const opaqueModal = {
    ...blankTitle,
    presentation: 'modal' as const,
    headerTransparent: false,
    headerBackground: undefined,
    headerStyle: { backgroundColor: t.bg },
  };
  // Home-style header: fully transparent (just the floating back chevron); the gradual
  // blur is supplied by the screen's own <FloatingStatusBar /> instead of the header.
  const transparentHeader = { ...blankTitle, headerBackground: () => null };
  return (
    <>
    {/* Translucent status bar so screens render under a frosted top bar. */}
    <StatusBar style={theme.endsWith('DARK') ? 'light' : 'dark'} translucent />
    {/* First-run nudge to enable the iOS share sheet — shows until acknowledged. */}
    <ShareNudgePopup />
    <Stack
      screenOptions={{
        // No page ever shows a centered header title — the page name lives in the
        // scrolling content instead. Setting it here (not just per-screen) guarantees
        // *every* route — registered, unregistered, or added later — is titleless, so a
        // raw route segment ("lists/[id]", "lists/edit", a stray "Routes") can never leak
        // through as the title.
        headerTitle: '',
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
      <Stack.Screen name="lists/actions" options={{ ...blankTitle }} />
      <Stack.Screen name="lists/new" options={{ ...opaqueModal }} />
      <Stack.Screen name="lists/edit" options={{ ...opaqueModal }} />
      <Stack.Screen name="bookmarks/[id]" options={{ ...blankTitle }} />
      {/* The new-bookmark drawer draws its own compact "New Bookmark" top bar (with a
          Cancel action) inside the modal, so it hides the empty chevron-only nav header. */}
      <Stack.Screen
        name="bookmarks/new"
        options={{
          // formSheet (not plain modal) so we can tune the top corner radius to a
          // milder curve; full-height detent + hidden grabber keep the current feel.
          presentation: 'formSheet',
          sheetAllowedDetents: [1.0],
          sheetCornerRadius: 16,
          sheetGrabberVisible: false,
          headerShown: false,
        }}
      />
      <Stack.Screen name="bookmarks/edit" options={{ ...opaqueModal }} />
      <Stack.Screen name="polls/index" options={{ ...blankTitle }} />
      <Stack.Screen name="polls/new" options={{ ...opaqueModal }} />
      <Stack.Screen name="polls/[pollId]" options={{ ...blankTitle }} />
      <Stack.Screen name="users/[handle]" options={{ ...transparentHeader }} />
      <Stack.Screen name="settings" options={{ ...blankTitle }} />
      <Stack.Screen name="share-help" options={{ ...blankTitle }} />
      <Stack.Screen name="delete-account" options={{ ...blankTitle }} />
      <Stack.Screen name="requests" options={{ ...blankTitle }} />
      <Stack.Screen name="friend-requests" options={{ ...transparentHeader }} />
      <Stack.Screen name="pending-requests" options={{ ...transparentHeader }} />
      <Stack.Screen name="dm/[conversationId]" options={{ ...blankTitle }} />
      <Stack.Screen name="dm/new" options={{ ...transparentHeader }} />
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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppThemeProvider mirrorToShared>
        <NavThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <BottomSheetModalProvider>
            {isPending ? (
              <View style={{ flex: 1 }} />
            ) : !session ? (
              <LoginScreen />
            ) : !session.user.handle ? (
              // Signed in but no handle yet — mirror web's onboarding gate.
              <OnboardingScreen onDone={() => refetch()} />
            ) : (
              <AppStack />
            )}
            {/* Global toast overlay — sits above every screen, reads the theme. */}
            <ToastHost />
          </BottomSheetModalProvider>
        </NavThemeProvider>
      </AppThemeProvider>
    </GestureHandlerRootView>
  );
}
