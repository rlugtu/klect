import { useState } from 'react';
import { Pressable, Switch, Text, TextInput, View } from 'react-native';

import { trpc } from '@/client/api';
import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';

// Inferred straight from web's tRPC procedure — no hand-written DTOs.
type Memberships = Awaited<ReturnType<typeof trpc.lists.mine.query>>;

const NAME_MAX = 30;

type Props = {
  lists: Memberships;
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
 * Multi-list picker for the standalone create-bookmark flow — mirrors web's `CreateBookmarkFlow`:
 * toggle any lists you can edit (owner/collaborator), and/or create new lists inline. The bookmark
 * is written independently into every selected + new list.
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
  const [draft, setDraft] = useState('');

  // Only lists the user can add bookmarks to (COLLABORATOR+). Matches web's role filter.
  const editable = lists.filter(
    (m) => m.role === 'OWNER' || m.role === 'COLLABORATOR',
  );

  function commitDraft() {
    const name = draft.trim();
    if (name) onAddNewList(name);
    setDraft('');
  }

  return (
    <View className="gap-2">
      <Text className="text-sm text-muted">Add to lists</Text>

      {editable.length > 0 && (
        <View className="flex-row flex-wrap gap-2">
          {editable.map((m) => {
            const on = selectedIds.includes(m.list.id);
            return (
              <Pressable
                key={m.list.id}
                onPress={() => onToggle(m.list.id)}
                className={`flex-row items-center gap-1.5 rounded-skin-sm border-skin px-2 py-1 ${
                  on ? 'border-primary bg-primary/20' : 'border-border bg-panel'
                }`}>
                <Text className="text-ink">{m.list.icon}</Text>
                <Text className="text-sm text-ink" numberOfLines={1}>
                  {m.list.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {newListNames.length > 0 && (
        <View className="gap-2">
          <View className="flex-row flex-wrap gap-2">
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
        </View>
      )}

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
  );
}
