import '@/global.css';

import { useEffect, useState } from 'react';
import { ActivityIndicator, Appearance, Pressable, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
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
import * as SecureStore from 'expo-secure-store';
import { close, openHostApp, type InitialProps } from 'expo-share-extension';

import { trpc } from '@/client/api';
import { readStoredBearerToken } from '@/client/bearer-store';
import { capHitMessage, freeLimitFrom, type FreeLimit } from '@/client/free-limit';
import {
  type ListOption,
  readSharedLists,
  toListOptions,
  writeSharedLists,
} from '@/client/shared-lists-cache';
import BookmarkForm, { EMPTY_BOOKMARK } from '@/components/bookmark-form';
import { ListPicker } from '@/components/list-picker';
import {
  ThemeProvider as AppThemeProvider,
  SHARED_THEME_KEY,
  SHARED_THEME_OPTS,
  isThemeName,
} from '@/theme/theme-provider';
import { THEME_TOKENS, type ThemeName } from '@/theme/tokens';

/**
 * Background for the frame rendered before the real theme is known. The user's chosen theme lives
 * behind an async keychain read, but `Appearance` is synchronous even in the extension's separate
 * process, so we can at least match system light/dark — which is exactly what ThemeProvider itself
 * falls back to (Modern, following the system scheme). Replaces a hardcoded white frame that
 * flashed every dark-mode user.
 */
function preMountBackground() {
  const dark = Appearance.getColorScheme() === 'dark';
  return THEME_TOKENS[dark ? 'MODERN_DARK' : 'MODERN_LIGHT'].bg;
}

/** Compact header bar with a Cancel that dismisses the share sheet (no expo-router here). */
function TopBar({ title }: { title: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      className="flex-row items-center justify-between border-b border-border bg-bg px-5 pb-4"
      style={{ paddingTop: insets.top + 12 }}>
      <Text className="text-xl font-semibold text-ink">{title}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cancel"
        hitSlop={8}
        onPress={() => close()}>
        <Text className="text-primary">Cancel</Text>
      </Pressable>
    </View>
  );
}

/**
 * The save flow rendered *inside* the iOS share sheet. Mirrors the standalone branch of
 * `app/bookmarks/new.tsx` (multi-list create), but authenticates from the shared keychain — the
 * extension is a separate process with no in-memory token or better-auth cookie — and dismisses via
 * `close()` instead of `router.back()`.
 */
function SaveScreen({ url, text }: InitialProps) {
  const sharedUrl = url ?? text ?? '';
  const initial = sharedUrl
    ? { ...EMPTY_BOOKMARK, urls: [sharedUrl] }
    : EMPTY_BOOKMARK;

  const [auth, setAuth] = useState<'checking' | 'in' | 'out'>('checking');
  // A free-tier cap refusal, plus how many rows the blocked save would have added. The
  // extension cannot host a paywall (see the branch that renders it below), so this replaces
  // the form with a nudge rather than opening anything.
  const [capHit, setCapHit] = useState<{ limit: FreeLimit; adding: number } | null>(null);
  const [lists, setLists] = useState<ListOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [newListNames, setNewListNames] = useState<string[]>([]);
  const [newListsPublic, setNewListsPublic] = useState(false);

  // Hydrate the picker instantly from the last snapshot the app write-mirrored into the shared
  // keychain — this cold extension process would otherwise show an empty picker until the network
  // round-trip below returns. Independent of auth so it paints as early as possible.
  useEffect(() => {
    readSharedLists().then((cached) => cached && setLists(cached));
  }, []);

  // The extension can't run the OAuth deep-link flow, so signing in has to happen in the app. Gate
  // on the shared-keychain token the app persisted; if it's missing, point the user to the app.
  useEffect(() => {
    readStoredBearerToken()
      .then((token) => {
        if (!token) {
          setAuth('out');
          return;
        }
        setAuth('in');
        // Refresh the picker + the cache in the background; the cached snapshot already shows.
        trpc.lists.mine
          .query()
          .then((m) => {
            setLists(toListOptions(m));
            writeSharedLists(m);
          })
          .catch(() => {});
      })
      .catch(() => setAuth('out'));
  }, []);

  if (auth === 'checking') {
    return (
      <View className="flex-1 items-center justify-center bg-bg">
        <ActivityIndicator />
      </View>
    );
  }

  // A cap hit here is a dead end by design. The extension runs in a **separate process**: no
  // expo-router navigator to push a screen into, no auth client (it would crash this process —
  // see client/api.ts), and no StoreKit presentation context. So it states the limit plainly
  // and hands off to the host app, reusing the same `openHostApp` nudge the signed-out branch
  // below already uses. `/paywall` is a real route in the app (app/paywall.tsx), so the deep
  // link lands on the upgrade screen rather than just the home tab.
  if (capHit) {
    return (
      <View className="flex-1 bg-bg">
        <TopBar title="Save to Klect" />
        <View className="flex-1 items-center justify-center gap-4 px-8">
          <Text className="text-center text-lg font-semibold text-ink">
            You&apos;ve hit your free plan limit
          </Text>
          <Text className="text-center text-ink">
            {capHitMessage(capHit.limit, capHit.adding)}
          </Text>
          <Text className="text-center text-sm text-muted">
            Upgrading has to happen in the app — the share sheet can&apos;t open the App Store
            purchase screen.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open Klect to upgrade"
            className="rounded-skin bg-primary px-6 py-3"
            onPress={() => openHostApp('/paywall')}>
            <Text className="font-semibold text-primary-ink">Open Klect to upgrade</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (auth === 'out') {
    return (
      <View className="flex-1 bg-bg">
        <TopBar title="Save to Klect" />
        <View className="flex-1 items-center justify-center gap-4 px-8">
          <Text className="text-center text-ink">
            Open Klect and sign in to save bookmarks from the share sheet.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open Klect"
            className="rounded-skin bg-primary px-6 py-3"
            onPress={() => openHostApp('/')}>
            <Text className="font-semibold text-primary-ink">Open Klect</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-bg">
      <TopBar title="Save to Klect" />
      <BookmarkForm
        initial={initial}
        autofillOnMount={Boolean(sharedUrl)}
        submitLabel="Save bookmark"
        header={
          <ListPicker
            lists={lists}
            selectedIds={selectedIds}
            onToggle={(id) =>
              setSelectedIds((prev) =>
                prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
              )
            }
            newListNames={newListNames}
            onAddNewList={(name) =>
              setNewListNames((prev) =>
                prev.includes(name) ? prev : [...prev, name],
              )
            }
            onRemoveNewList={(name) =>
              setNewListNames((prev) => prev.filter((x) => x !== name))
            }
            newListsPublic={newListsPublic}
            onToggleNewListsPublic={setNewListsPublic}
          />
        }
        onSubmit={async (data) => {
          if (selectedIds.length + newListNames.length === 0) {
            throw new Error('Pick at least one list for the bookmark.');
          }
          try {
            await trpc.bookmarks.createInLists.mutate({
              existingListIds: selectedIds,
              newListNames,
              data,
              newListsPublic,
            });
          } catch (e) {
            // Structured cap refusal off `error.data.freeLimit`, never the message text.
            const cap = freeLimitFrom(e);
            if (!cap) throw e;
            // Same split as app/bookmarks/new.tsx, mirroring core.createBookmarkInLists:
            // only new lists consume list capacity, while bookmark capacity is consumed by
            // every target the user owns plus those new lists.
            const ownedExisting = selectedIds.filter((id) =>
              lists.some((l) => l.id === id && l.role === 'OWNER'),
            ).length;
            setCapHit({
              limit: cap,
              adding:
                cap.limit === 'lists'
                  ? newListNames.length
                  : ownedExisting + newListNames.length,
            });
            return;
          }
          close();
        }}
      />
    </View>
  );
}

/**
 * Root of the share-extension bundle (registered as "shareExtension" in `index.share.tsx`).
 * Replicates the minimum provider subtree the bookmark form needs — SafeArea + gesture root +
 * the app's theme — without expo-router or the bottom-sheet provider (the form's LocationInput
 * uses a plain dropdown, not @gorhom/bottom-sheet). Fonts are gated the same way the app does.
 */
export default function ShareExtension(props: InitialProps) {
  const [fontsLoaded] = useFonts({
    Newsreader_600SemiBold,
    Newsreader_500Medium_Italic,
    WorkSans_400Regular,
    WorkSans_500Medium,
    WorkSans_600SemiBold,
    Geist_400Regular,
    Geist_500Medium,
    Geist_500Medium_Italic,
    Geist_600SemiBold,
  });

  // Match the extension to the user's *actual* app theme, which the app write-mirrors into the
  // shared keychain group (only place this separate process can read it). `undefined` = still
  // reading; `null` = nothing stored → the provider falls back to system light/dark → Modern.
  const [initialTheme, setInitialTheme] = useState<ThemeName | null | undefined>(
    undefined,
  );
  useEffect(() => {
    SecureStore.getItemAsync(SHARED_THEME_KEY, SHARED_THEME_OPTS)
      .then((v) => setInitialTheme(isThemeName(v) ? v : null))
      .catch(() => setInitialTheme(null));
  }, []);

  // Gate the theme provider until the seed resolves — `initialTheme` only seeds on mount, so the
  // provider must not mount before we know it. Opaque surface meanwhile, matched to the system
  // scheme, never a black void or a white flash.
  if (!fontsLoaded || initialTheme === undefined) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: preMountBackground() }} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AppThemeProvider initialTheme={initialTheme ?? undefined}>
          <SaveScreen {...props} />
        </AppThemeProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
