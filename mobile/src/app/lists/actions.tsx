import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
import { useHeaderHeight } from '@react-navigation/elements';

import { trpc } from '@/client/api';
import { toast, errorMessage } from '@/client/toast';
import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';

/**
 * List-level actions screen (opened from a list's action row). Any member can
 * Duplicate the list into a fresh independent copy they own (bookmarks + tags
 * only). Only the owner sees Clear, which deletes every bookmark in the list.
 */
export default function ListActionsScreen() {
  const router = useRouter();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const { theme } = useTheme();
  const t = THEME_TOKENS[theme];
  const headerHeight = useHeaderHeight();

  const [isOwner, setIsOwner] = useState(false);
  const [newName, setNewName] = useState(`Copy of ${name ?? 'list'}`.slice(0, 30));
  const [duplicating, setDuplicating] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      trpc.lists.get
        .query({ listId: id })
        .then((access) => setIsOwner(access?.role === 'OWNER'))
        .catch(() => {});
    }, [id]),
  );

  async function duplicate() {
    if (!id || duplicating) return;
    setDuplicating(true);
    setError(null);
    try {
      const list = await trpc.lists.duplicate.mutate({
        listId: id,
        name: newName.trim(),
      });
      toast.success('List duplicated');
      router.replace({
        pathname: '/lists/[id]',
        params: { id: list.id, name: list.name },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Duplicate failed');
      toast.error(errorMessage(e, 'Duplicate failed'));
      setDuplicating(false);
    }
  }

  function confirmClear() {
    Alert.alert(
      'Clear all bookmarks?',
      'This deletes every bookmark in this list. The list itself stays. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear all',
          style: 'destructive',
          onPress: async () => {
            if (!id || clearing) return;
            setClearing(true);
            setError(null);
            try {
              await trpc.lists.clearBookmarks.mutate({ listId: id });
              toast.success('Bookmarks cleared');
              router.back();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Clear failed');
              toast.error(errorMessage(e, 'Clear failed'));
              setClearing(false);
            }
          },
        },
      ],
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerStyle={{ padding: 16, paddingTop: headerHeight + 8, gap: 24 }}>
      <Stack.Screen options={{ headerTitle: '' }} />

      <Text className="font-serif text-3xl text-ink">Actions</Text>

      {error && <Text className="font-sans text-danger">{error}</Text>}

      <View className="gap-2">
        <Text className="text-sm uppercase text-muted">Duplicate list</Text>
        <Text className="font-sans text-sm text-muted">
          Makes a private copy you own with all the bookmarks — members, polls,
          and comments are not carried over.
        </Text>
        <TextInput
          className="rounded-skin border-skin border-border px-4 py-3 font-sans text-ink"
          placeholder="New list name"
          placeholderTextColor={t.muted}
          value={newName}
          onChangeText={setNewName}
          maxLength={30}
        />
        <Pressable
          className="items-center rounded-skin bg-primary py-3"
          disabled={duplicating || newName.trim() === ''}
          onPress={duplicate}>
          {duplicating ? (
            <ActivityIndicator color={t.primaryInk} />
          ) : (
            <Text className="font-sans-semibold text-primary-ink">
              Duplicate list
            </Text>
          )}
        </Pressable>
      </View>

      {isOwner && (
        <View className="gap-2 border-t border-border pt-5">
          <Text className="text-sm uppercase text-muted">Danger zone</Text>
          <Text className="font-sans text-sm text-muted">
            Removes every bookmark in this list. The list itself stays.
          </Text>
          <Pressable
            className="items-center rounded-skin border-skin border-danger py-3"
            disabled={clearing}
            onPress={confirmClear}>
            {clearing ? (
              <ActivityIndicator color={t.danger} />
            ) : (
              <Text className="font-sans-semibold text-danger">
                Clear all bookmarks
              </Text>
            )}
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}
