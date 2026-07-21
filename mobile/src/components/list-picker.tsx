import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ListOption } from '@/client/shared-lists-cache';
import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';

const NAME_MAX = 30;

type Props = {
  lists: ListOption[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  newListNames: string[];
  onAddNewList: (name: string) => void;
  onRemoveNewList: (name: string) => void;
  /** Visibility applied to lists created inline (only shown when there are any). */
  newListsPublic: boolean;
  onToggleNewListsPublic: (value: boolean) => void;
};

/**
 * Multi-list picker for the standalone create-bookmark + share-extension flows — mirrors web's
 * `CreateBookmarkFlow`: toggle any lists you can edit (owner/collaborator), and/or create new
 * lists inline. The bookmark is written independently into every selected + new list.
 *
 * Compact layout: the form body shows only the *selected* lists as chips plus an "Add to a list"
 * button, so a user with many lists doesn't pay a wall of pills. The full, searchable list lives
 * behind a modal. Uses RN `<Modal>` (not @gorhom/bottom-sheet) so it works inside the share
 * extension, whose separate process has no bottom-sheet provider.
 */
export function ListPicker({
  lists,
  selectedIds,
  onToggle,
  newListNames,
  onAddNewList,
  onRemoveNewList,
  newListsPublic,
  onToggleNewListsPublic,
}: Props) {
  const { theme } = useTheme();
  const t = THEME_TOKENS[theme];
  const muted = t.muted;
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Only lists the user can add bookmarks to (COLLABORATOR+). Matches web's role filter.
  const editable = useMemo(
    () => lists.filter((l) => l.role === 'OWNER' || l.role === 'COLLABORATOR'),
    [lists],
  );
  const selected = editable.filter((l) => selectedIds.includes(l.id));
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? editable.filter((l) => l.name.toLowerCase().includes(q)) : editable;
  }, [editable, search]);

  const chosenCount = selectedIds.length + newListNames.length;

  function commitDraft() {
    const name = draft.trim();
    if (name) onAddNewList(name);
    setDraft('');
  }

  return (
    <View className="gap-2">
      <Text className="font-sans-medium text-sm uppercase text-muted">Add to lists</Text>

      {/* Only the selected + new-list chips live in the form body. */}
      {(selected.length > 0 || newListNames.length > 0) && (
        <View className="flex-row flex-wrap gap-2">
          {selected.map((l) => (
            <Pressable
              key={l.id}
              onPress={() => onToggle(l.id)}
              className="flex-row items-center gap-1.5 rounded-skin-sm border-skin border-primary bg-primary/20 px-2 py-1">
              <Text className="text-ink">{l.icon}</Text>
              <Text className="text-sm text-ink" numberOfLines={1}>
                {l.name}
              </Text>
              <Text className="text-sm text-muted">✕</Text>
            </Pressable>
          ))}
          {newListNames.map((name) => (
            <Pressable
              key={name}
              onPress={() => onRemoveNewList(name)}
              className="flex-row items-center gap-1.5 rounded-skin-sm border-skin border-primary bg-primary/20 px-2 py-1">
              <Text className="text-sm text-ink" numberOfLines={1}>
                📁 {name} (new)
              </Text>
              <Text className="text-sm text-muted">✕</Text>
            </Pressable>
          ))}
        </View>
      )}

      <Pressable
        className="flex-row items-center gap-2 self-start rounded-skin border-skin border-border bg-panel px-3 py-2"
        onPress={() => setOpen(true)}>
        <Text className="text-ink">＋</Text>
        <Text className="text-sm text-ink">
          {chosenCount > 0 ? 'Add to another list' : 'Add to a list'}
        </Text>
      </Pressable>

      {newListNames.length > 0 && (
        <View className="flex-row items-center justify-between rounded-skin border-skin border-border px-4 py-2.5">
          <Text className="flex-1 pr-3 text-sm text-muted">
            Make {newListNames.length === 1 ? 'the new list' : 'new lists'} public
            (anyone can view). Off = private.
          </Text>
          <Switch
            value={newListsPublic}
            onValueChange={onToggleNewListsPublic}
            trackColor={{ true: t.primary }}
          />
        </View>
      )}

      {/* Searchable full picker — bottom-anchored RN Modal (share-extension safe). */}
      <Modal
        transparent
        visible={open}
        animationType="slide"
        onRequestClose={() => setOpen(false)}>
        <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <Pressable className="flex-1" onPress={() => setOpen(false)} />
          <View
            className="gap-3 rounded-t-3xl border-skin border-border bg-bg px-4 pt-4"
            style={{ paddingBottom: 16 + insets.bottom }}>
            <View className="flex-row items-center justify-between">
              <Text className="font-serif text-xl text-ink">Add to lists</Text>
              <Pressable hitSlop={8} onPress={() => setOpen(false)}>
                <Text className="font-sans-medium text-primary">Done</Text>
              </Pressable>
            </View>

            <TextInput
              className="rounded-skin border-skin border-border px-4 py-3 text-ink"
              placeholder="Search your lists"
              placeholderTextColor={muted}
              autoCapitalize="none"
              autoCorrect={false}
              value={search}
              onChangeText={setSearch}
            />

            <ScrollView
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: windowHeight * 0.45 }}>
              {filtered.length === 0 ? (
                <Text className="px-1 py-3 text-sm text-muted">
                  {editable.length === 0
                    ? 'No lists you can add to yet — create one below.'
                    : 'No lists match your search.'}
                </Text>
              ) : (
                <View className="gap-1">
                  {filtered.map((l) => {
                    const on = selectedIds.includes(l.id);
                    return (
                      <Pressable
                        key={l.id}
                        onPress={() => onToggle(l.id)}
                        className={`flex-row items-center gap-2 rounded-skin border-skin px-3 py-3 ${
                          on ? 'border-primary bg-primary/20' : 'border-border bg-panel'
                        }`}>
                        <Text className="text-ink">{l.icon}</Text>
                        <Text className="flex-1 text-ink" numberOfLines={1}>
                          {l.name}
                        </Text>
                        <Text className={on ? 'text-primary' : 'text-muted'}>
                          {on ? '✓' : ''}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </ScrollView>

            <TextInput
              className="rounded-skin border-skin border-border px-4 py-3 text-ink"
              placeholder="Or create a new list — type a name"
              placeholderTextColor={muted}
              value={draft}
              maxLength={NAME_MAX}
              onChangeText={setDraft}
              onSubmitEditing={commitDraft}
              onBlur={commitDraft}
              returnKeyType="done"
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}
