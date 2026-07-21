import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useHeaderHeight } from '@react-navigation/elements';

import { trpc } from '@/client/api';
import { toast, errorMessage } from '@/client/toast';
import { atHandle } from '@/lib/handle';
import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';
import { cardShadow } from '@/theme/shadows';

type FriendsData = Awaited<ReturnType<typeof trpc.friends.list.query>>;
type Friend = FriendsData['friends'][number];

/**
 * Share a bookmark to one or more friends over DM (Instagram-style). Pick any number of
 * friends, optionally add a caption, then send — each recipient gets a shared-bookmark card
 * in their DM thread that they can save into their own lists. Recipients are friends only.
 */
export default function ShareBookmarkScreen() {
  const { theme } = useTheme();
  const t = THEME_TOKENS[theme];
  const headerHeight = useHeaderHeight();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string; name?: string }>();

  const [friends, setFriends] = useState<Friend[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [caption, setCaption] = useState('');
  const [sending, setSending] = useState(false);

  useFocusEffect(
    useCallback(() => {
      trpc.friends.list
        .query()
        .then((d) => setFriends(d.friends))
        .catch(() => {})
        .finally(() => setLoaded(true));
    }, []),
  );

  function toggle(friendId: string) {
    setSelected((cur) =>
      cur.includes(friendId) ? cur.filter((x) => x !== friendId) : [...cur, friendId],
    );
  }

  async function send() {
    if (!id || selected.length === 0 || sending) return;
    setSending(true);
    try {
      const { results } = await trpc.dms.shareBookmark.mutate({
        bookmarkId: id,
        recipientUserIds: selected,
        caption,
      });
      const sent = results.filter((r) => r.ok).length;
      const failed = results.length - sent;
      if (sent > 0) {
        toast.success(
          failed > 0
            ? `Sent to ${sent}, failed for ${failed}`
            : `Shared with ${sent} ${sent === 1 ? 'friend' : 'friends'}`,
        );
        router.back();
      } else {
        toast.error(results[0]?.error ?? 'Could not share bookmark');
      }
    } catch (e) {
      toast.error(errorMessage(e, 'Could not share bookmark'));
    }
    setSending(false);
  }

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['left', 'right']} className="bg-bg">
      <Stack.Screen options={{ headerTitle: '' }} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: 16,
          paddingTop: headerHeight + 8,
          paddingBottom: 40,
          gap: 10,
        }}>
        <Text className="font-serif text-3xl text-ink">Send to…</Text>

        {loaded && friends.length === 0 && (
          <Text className="font-serif-italic text-muted">
            Add friends to share bookmarks with them.
          </Text>
        )}

        {friends.map((f) => {
          const on = selected.includes(f.friend.id);
          return (
            <Pressable
              key={f.friendshipId}
              style={cardShadow}
              onPress={() => toggle(f.friend.id)}
              className={`flex-row items-center gap-3 rounded-skin border-skin p-4 ${
                on ? 'border-primary bg-primary/20' : 'border-border bg-panel'
              }`}>
              <Text className="text-lg">{f.friend.icon ?? '🔖'}</Text>
              <Text className="flex-1 font-sans-medium text-base text-ink" numberOfLines={1}>
                {atHandle(f.friend.handle)}
              </Text>
              <Text className={on ? 'text-primary' : 'text-muted'}>{on ? '✓' : ''}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View
        className="gap-2 border-t border-border px-4 py-3"
        style={{ paddingBottom: 16 }}>
        <TextInput
          className="rounded-skin border-skin border-border bg-panel px-4 py-2.5 font-sans text-ink"
          placeholder="Add a message… (optional)"
          placeholderTextColor={t.muted}
          value={caption}
          onChangeText={setCaption}
        />
        <Pressable
          className={`flex-row items-center justify-center gap-2 rounded-skin py-3 ${
            selected.length === 0 || sending ? 'bg-muted/40' : 'bg-primary'
          }`}
          disabled={selected.length === 0 || sending}
          onPress={send}>
          {sending ? (
            <ActivityIndicator color={t.primaryInk} />
          ) : (
            <>
              <Ionicons name="paper-plane-outline" size={16} color={t.primaryInk} />
              <Text className="font-sans-semibold text-primary-ink">
                {selected.length > 1 ? `Send to ${selected.length}` : 'Send'}
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
