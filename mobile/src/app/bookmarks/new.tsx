import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { trpc } from '@/client/api';
import { freeLimitFrom, paywallRouteFor } from '@/client/free-limit';
import { toast } from '@/client/toast';
import { toListOptions } from '@/client/shared-lists-cache';
import BookmarkForm, { EMPTY_BOOKMARK } from '@/components/bookmark-form';
import { ListPicker } from '@/components/list-picker';

type Memberships = Awaited<ReturnType<typeof trpc.lists.mine.query>>;

/**
 * Compact top bar for the new-bookmark modal drawer — the page title lives here (in-content,
 * like the rest of the app) with a Cancel to dismiss, in place of the empty chevron nav header.
 */
function DrawerTopBar({ onCancel }: { onCancel: () => void }) {
  return (
    <View className="flex-row items-center justify-between border-b border-border bg-bg px-4 pb-3 pt-4">
      <Text className="font-serif text-xl text-ink">New Bookmark</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cancel"
        hitSlop={8}
        onPress={onCancel}>
        <Text className="font-sans-medium text-primary">Cancel</Text>
      </Pressable>
    </View>
  );
}

/**
 * Create a bookmark. Two modes:
 *  - with a `listId` param (in-list "Add" flow): saves one bookmark into that list.
 *  - without one (standalone, from the "＋" Create tab): shows a list picker and writes an
 *    independent bookmark into each selected / newly-created list via `bookmarks.createInLists`.
 */
export default function NewBookmarkScreen() {
  const router = useRouter();
  const { listId, url } = useLocalSearchParams<{
    listId?: string;
    listName?: string;
    url?: string;
  }>();

  // A shared / prefilled URL seeds the form and triggers metadata autofill on mount.
  const initial = url ? { ...EMPTY_BOOKMARK, urls: [url] } : EMPTY_BOOKMARK;
  const autofillOnMount = Boolean(url);

  const [lists, setLists] = useState<Memberships>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [newListNames, setNewListNames] = useState<string[]>([]);
  const [newListsPublic, setNewListsPublic] = useState(false);

  // Only the standalone flow needs the list picker.
  useFocusEffect(
    useCallback(() => {
      if (listId) return;
      trpc.lists.mine.query().then(setLists).catch(() => {});
    }, [listId]),
  );

  const form = listId ? (
    <BookmarkForm
      initial={initial}
      autofillOnMount={autofillOnMount}
      submitLabel="Save bookmark"
      onSubmit={async (data) => {
        try {
          await trpc.bookmarks.create.mutate({ listId, data });
        } catch (e) {
          // Cap hit: open the paywall rather than leaving a bare failure. Read off the
          // structured `error.data.freeLimit`, never the message text. Re-thrown either way
          // so BookmarkForm clears its submitting state and keeps the draft usable — it only
          // resets on failure, because a success navigates away and this does not.
          const cap = freeLimitFrom(e);
          if (cap) router.push(paywallRouteFor(cap));
          throw e;
        }
        toast.success('Bookmark saved');
        router.back();
      }}
    />
  ) : (
    <BookmarkForm
      initial={initial}
      autofillOnMount={autofillOnMount}
      submitLabel="Save bookmark"
      header={
        <ListPicker
          lists={toListOptions(lists)}
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
        const count = selectedIds.length + newListNames.length;
        try {
          await trpc.bookmarks.createInLists.mutate({
            existingListIds: selectedIds,
            newListNames,
            data,
            newListsPublic,
          });
        } catch (e) {
          const cap = freeLimitFrom(e);
          if (!cap) throw e;
          // Same re-throw contract as the single-list path above: the paywall opens, and the
          // error still reaches BookmarkForm so its Save button comes back.
          //
          // This path writes one bookmark per target list and the server checks the *total*
          // it would add, so a single tap can be several over the cap at once. Telling the
          // paywall how many makes it say "you'd need 3 more" rather than quoting a flat
          // limit the user is currently under (see capHitMessage in client/free-limit.ts).
          //
          // The two caps count different things, mirroring core.createBookmarkInLists:
          // only brand-new lists add list capacity, while bookmark capacity is consumed by
          // every target the user *owns* (a collaborator's list is their capacity, never
          // ours), plus the new lists, which the user owns by definition.
          const ownedExisting = selectedIds.filter((id) =>
            lists.some((m) => m.list.id === id && m.role === 'OWNER'),
          ).length;
          const adding =
            cap.limit === 'lists'
              ? newListNames.length
              : ownedExisting + newListNames.length;
          router.push(paywallRouteFor(cap, adding));
          throw e;
        }
        toast.success(`Saved to ${count} ${count === 1 ? 'list' : 'lists'}`);
        router.back();
      }}
    />
  );

  return (
    <View style={{ flex: 1 }} className="bg-bg">
      <DrawerTopBar onCancel={() => router.back()} />
      {form}
    </View>
  );
}
