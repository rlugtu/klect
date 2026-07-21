import { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { trpc } from '@/client/api';
import { toast, errorMessage } from '@/client/toast';
import { toListOptions } from '@/client/shared-lists-cache';
import { ListPicker } from '@/components/list-picker';
import TagPill from '@/components/tag-pill';

type Memberships = Awaited<ReturnType<typeof trpc.lists.mine.query>>;

/** The DM-shared snapshot shape (mirrors web's SharedBookmarkSnapshot; carried as JSON). */
export type SharedBookmarkSnapshot = {
  name: string;
  description: string;
  urls: string[];
  images: string[];
  notes: string;
  location: string;
  tagNames: string[];
};

/**
 * A bookmark shared over DM, rendered as a card in the thread. Shows a compact summary with a
 * preview toggle (expand for full details) and a Save action that copies the bookmark into the
 * recipient's own lists (independent copies) via the shared multi-list picker.
 */
export default function SharedBookmarkCard({
  messageId,
  snapshot,
  mine,
}: {
  messageId: string;
  snapshot: SharedBookmarkSnapshot;
  mine: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);

  const [lists, setLists] = useState<Memberships>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [newListNames, setNewListNames] = useState<string[]>([]);
  const [newListsPublic, setNewListsPublic] = useState(false);
  const [saving, setSaving] = useState(false);

  const openSave = useCallback(() => {
    setSaveOpen(true);
    trpc.lists.mine.query().then(setLists).catch(() => {});
  }, []);

  const count = selectedIds.length + newListNames.length;

  async function save() {
    if (count === 0 || saving) return;
    setSaving(true);
    try {
      await trpc.dms.saveSharedBookmark.mutate({
        messageId,
        existingListIds: selectedIds,
        newListNames,
        newListsPublic,
      });
      toast.success(`Saved to ${count} ${count === 1 ? 'list' : 'lists'}`);
      setSaveOpen(false);
      setSelectedIds([]);
      setNewListNames([]);
    } catch (e) {
      toast.error(errorMessage(e, 'Could not save bookmark'));
    }
    setSaving(false);
  }

  return (
    <View
      className={`max-w-[85%] gap-2 rounded-skin border-skin border-border bg-panel p-3 ${
        mine ? 'self-end' : 'self-start'
      }`}>
      {snapshot.images[0] ? (
        <View className="overflow-hidden rounded-skin-sm">
          <Image
            source={snapshot.images[0]}
            style={{ width: '100%', aspectRatio: 1.6 }}
            contentFit="cover"
            transition={150}
          />
        </View>
      ) : null}

      <Text className="font-sans-semibold text-ink">{snapshot.name}</Text>
      {snapshot.location ? (
        <Text className="font-sans text-xs text-muted">📍 {snapshot.location}</Text>
      ) : null}

      {expanded && (
        <View className="gap-2">
          {snapshot.description ? (
            <Text className="font-sans text-sm text-ink">{snapshot.description}</Text>
          ) : null}
          {snapshot.notes ? (
            <Text className="font-sans text-sm text-muted">{snapshot.notes}</Text>
          ) : null}
          {snapshot.tagNames.length > 0 && (
            <View className="flex-row flex-wrap gap-1">
              {snapshot.tagNames.map((name) => (
                <TagPill key={name} name={name} />
              ))}
            </View>
          )}
        </View>
      )}

      <View className="mt-1 flex-row items-center justify-between">
        <Pressable onPress={() => setExpanded((v) => !v)}>
          <Text className="font-sans text-xs text-muted underline">
            {expanded ? 'Hide preview' : 'Preview'}
          </Text>
        </Pressable>
        <Pressable
          className="rounded-skin bg-primary px-4 py-1.5"
          onPress={openSave}>
          <Text className="font-sans-semibold text-sm text-primary-ink">Save</Text>
        </Pressable>
      </View>

      <Modal
        transparent
        visible={saveOpen}
        animationType="slide"
        onRequestClose={() => setSaveOpen(false)}>
        <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <Pressable className="flex-1" onPress={() => setSaveOpen(false)} />
          <View
            className="gap-3 rounded-t-3xl border-skin border-border bg-bg px-4 pt-4"
            style={{ paddingBottom: 16 + insets.bottom }}>
            <View className="flex-row items-center justify-between">
              <Text className="font-serif text-xl text-ink">Save to lists</Text>
              <Pressable hitSlop={8} onPress={() => setSaveOpen(false)}>
                <Text className="font-sans-medium text-primary">Cancel</Text>
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
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
                  setNewListNames((prev) => (prev.includes(name) ? prev : [...prev, name]))
                }
                onRemoveNewList={(name) =>
                  setNewListNames((prev) => prev.filter((x) => x !== name))
                }
                newListsPublic={newListsPublic}
                onToggleNewListsPublic={setNewListsPublic}
              />
            </ScrollView>

            <Pressable
              className={`items-center rounded-skin py-3 ${
                count === 0 || saving ? 'bg-muted/40' : 'bg-primary'
              }`}
              disabled={count === 0 || saving}
              onPress={save}>
              <Text className="font-sans-semibold text-primary-ink">
                {saving ? 'Saving…' : count > 0 ? `Save to ${count}` : 'Save'}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
