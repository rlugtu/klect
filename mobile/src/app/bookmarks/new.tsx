import { useLocalSearchParams, useRouter } from 'expo-router';

import { trpc } from '@/client/api';
import BookmarkForm, { EMPTY_BOOKMARK } from '@/components/bookmark-form';

/** Create a bookmark inside a list. */
export default function NewBookmarkScreen() {
  const router = useRouter();
  const { listId } = useLocalSearchParams<{ listId: string; listName?: string }>();

  return (
    <BookmarkForm
      initial={EMPTY_BOOKMARK}
      submitLabel="Save bookmark"
      onSubmit={async (data) => {
        if (!listId) return;
        await trpc.bookmarks.create.mutate({ listId, data });
        router.back();
      }}
    />
  );
}
