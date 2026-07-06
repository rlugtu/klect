import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { trpc } from '@/client/api';
import ListForm, { type ListValues } from '@/components/list-form';

/** Edit a list: fetch it, prefill the form, then update. */
export default function EditListScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [initial, setInitial] = useState<ListValues | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    trpc.lists.get
      .query({ listId: id })
      .then((m) => {
        if (!m) {
          setError('List not found');
          return;
        }
        setInitial({
          name: m.list.name,
          description: m.list.description ?? '',
          icon: m.list.icon,
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Request failed'));
  }, [id]);

  if (error) {
    return (
      <View className="flex-1 bg-bg p-4">
        <Text className="text-danger">{error}</Text>
      </View>
    );
  }

  if (!initial) {
    return (
      <View className="flex-1 items-center justify-center bg-bg">
        <ActivityIndicator />
      </View>
    );
  }

  function confirmDelete() {
    Alert.alert('Delete list?', 'This deletes the list and its bookmarks.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!id) return;
          await trpc.lists.delete.mutate({ listId: id });
          // Pop the edit modal AND the underlying (now-gone) list screen -> home.
          router.dismissAll();
        },
      },
    ]);
  }

  return (
    <ListForm
      initial={initial}
      submitLabel="Save changes"
      onDelete={confirmDelete}
      onSubmit={async (v) => {
        if (!id) return;
        await trpc.lists.update.mutate({
          listId: id,
          data: { name: v.name, description: v.description, icon: v.icon },
        });
        router.back();
      }}
    />
  );
}
