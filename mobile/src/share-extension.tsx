import '@/global.css';

import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
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
import { close, openHostApp, type InitialProps } from 'expo-share-extension';

import { trpc } from '@/client/api';
import { readStoredBearerToken } from '@/client/bearer-store';
import BookmarkForm, { EMPTY_BOOKMARK } from '@/components/bookmark-form';
import { ListPicker } from '@/components/list-picker';
import { ThemeProvider as AppThemeProvider } from '@/theme/theme-provider';

// Inferred straight from web's tRPC procedure — no hand-written DTOs.
type Memberships = Awaited<ReturnType<typeof trpc.lists.mine.query>>;

/** Compact header bar with a Cancel that dismisses the share sheet (no expo-router here). */
function TopBar({ title }: { title: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      className="flex-row items-center justify-between border-b border-border bg-bg px-4 pb-3"
      style={{ paddingTop: insets.top + 8 }}>
      <Text className="text-lg font-semibold text-ink">{title}</Text>
      <Pressable hitSlop={8} onPress={() => close()}>
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
  const [lists, setLists] = useState<Memberships>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [newListNames, setNewListNames] = useState<string[]>([]);
  const [newListsPublic, setNewListsPublic] = useState(false);

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
        trpc.lists.mine.query().then(setLists).catch(() => {});
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

  if (auth === 'out') {
    return (
      <View className="flex-1 bg-bg">
        <TopBar title="Save to Klect" />
        <View className="flex-1 items-center justify-center gap-4 px-8">
          <Text className="text-center text-ink">
            Open Klect and sign in to save bookmarks from the share sheet.
          </Text>
          <Pressable
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
          await trpc.bookmarks.createInLists.mutate({
            existingListIds: selectedIds,
            newListNames,
            data,
            newListsPublic,
          });
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

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AppThemeProvider>
          {fontsLoaded ? (
            <SaveScreen {...props} />
          ) : (
            <View className="flex-1 bg-bg" />
          )}
        </AppThemeProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
