import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { trpc } from '@/client/api';
import BookmarkForm, { EMPTY_BOOKMARK } from '@/components/bookmark-form';
import { ListPicker } from '@/components/list-picker';

type Memberships = Awaited<ReturnType<typeof trpc.lists.mine.query>>;

/**
 * Create a bookmark. Two modes:
 *  - with a `listId` param (in-list "Add" flow): saves one bookmark into that list.
 *  - without one (standalone, from the home "＋ Bookmark" button): shows a list picker and writes an
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

  if (listId) {
    return (
      <BookmarkForm
        initial={initial}
        autofillOnMount={autofillOnMount}
        submitLabel="Save bookmark"
        onSubmit={async (data) => {
          await trpc.bookmarks.create.mutate({ listId, data });
          router.back();
        }}
      />
    );
  }

  return (
    <BookmarkForm
      initial={initial}
      autofillOnMount={autofillOnMount}
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
        router.back();
      }}
    />
  );
}
