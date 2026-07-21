import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from '@react-navigation/elements';

import { trpc } from '@/client/api';
import { subscribeDm, realtimeEnabled } from '@/client/realtime';
import { authClient } from '@/client/auth';
import SharedBookmarkCard, {
  type SharedBookmarkSnapshot,
} from '@/components/dms/shared-bookmark-card';
import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';

type MessagesPage = Awaited<ReturnType<typeof trpc.dms.messages.query>>;
type Message = MessagesPage['messages'][number];

/**
 * A DM thread. Loads older history on demand (keyset cursor), refreshes the newest page off the
 * conversation's realtime channel (polling fallback), marks read on focus, and disables sending
 * when the two are no longer friends (history stays readable).
 */
export default function DmThreadScreen() {
  const { theme } = useTheme();
  const t = THEME_TOKENS[theme];
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  // When the keyboard is up it already covers the home-indicator area, so the composer
  // should sit flush on it; the bottom inset is only needed when the keyboard is hidden.
  const [keyboardShown, setKeyboardShown] = useState(false);
  const { conversationId, handle } = useLocalSearchParams<{
    conversationId: string;
    handle?: string;
  }>();
  const myId = authClient.useSession().data?.user.id ?? '';

  const [messages, setMessages] = useState<Message[]>([]);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [canSend, setCanSend] = useState(true);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, () => setKeyboardShown(true));
    const hide = Keyboard.addListener(hideEvt, () => setKeyboardShown(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const mergeNewest = useCallback((incoming: Message[]) => {
    setMessages((cur) => {
      const seen = new Set(cur.map((m) => m.id));
      const added = incoming.filter((m) => !seen.has(m.id));
      if (added.length === 0) return cur;
      return [...cur, ...added].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    });
  }, []);

  const refreshNewest = useCallback(() => {
    trpc.dms.messages
      .query({ conversationId })
      .then((p) => {
        mergeNewest(p.messages);
        setCanSend(p.canSend);
        if (olderCursor === null && !loaded) setOlderCursor(p.nextCursor);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [conversationId, mergeNewest, olderCursor, loaded]);

  // Load the first page + mark read whenever the screen gains focus.
  useFocusEffect(
    useCallback(() => {
      trpc.dms.messages
        .query({ conversationId })
        .then((p) => {
          setMessages(p.messages);
          setOlderCursor(p.nextCursor);
          setCanSend(p.canSend);
        })
        .catch(() => {})
        .finally(() => setLoaded(true));
      trpc.dms.markRead.mutate({ conversationId }).catch(() => {});
    }, [conversationId]),
  );

  useEffect(() => {
    const unsub = subscribeDm(`dm:conv:${conversationId}`, () => {
      refreshNewest();
      trpc.dms.markRead.mutate({ conversationId }).catch(() => {});
    });
    const id = setInterval(refreshNewest, realtimeEnabled() ? 20000 : 5000);
    return () => {
      unsub();
      clearInterval(id);
    };
  }, [conversationId, refreshNewest]);

  async function loadOlder() {
    if (!olderCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const p = await trpc.dms.messages.query({ conversationId, cursor: olderCursor });
      setMessages((cur) => {
        const seen = new Set(cur.map((m) => m.id));
        return [...p.messages.filter((m) => !seen.has(m.id)), ...cur];
      });
      setOlderCursor(p.nextCursor);
    } finally {
      setLoadingOlder(false);
    }
  }

  async function send() {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const res = await trpc.dms.send.mutate({ conversationId, body: text });
      if ('message' in res) {
        setBody('');
        mergeNewest([res.message]);
      }
    } catch {
      // swallow — the composer keeps the text so the user can retry
    }
    setSending(false);
  }

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['left', 'right']} className="bg-bg">
      <Stack.Screen options={{ headerTitle: handle ?? 'Chat' }} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{
            padding: 16,
            paddingTop: headerHeight + 8,
            gap: 8,
          }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListHeaderComponent={
            olderCursor ? (
              <Pressable onPress={loadOlder} className="items-center py-2">
                <Text className="text-sm text-muted underline">
                  {loadingOlder ? 'Loading…' : 'Load older messages'}
                </Text>
              </Pressable>
            ) : null
          }
          ListEmptyComponent={
            loaded ? (
              <Text className="mt-8 text-center font-serif-italic text-muted">
                No messages yet — say hi 👋
              </Text>
            ) : (
              <ActivityIndicator style={{ marginTop: 32 }} />
            )
          }
          renderItem={({ item }) => {
            const mine = item.senderId === myId;
            if (item.type === 'BOOKMARK') {
              return (
                <View className={mine ? 'items-end' : 'items-start'}>
                  {item.body ? (
                    <View
                      className={`mb-1 max-w-[78%] rounded-skin px-3 py-2 ${
                        mine
                          ? 'self-end bg-primary'
                          : 'self-start border-skin border-border bg-panel'
                      }`}>
                      <Text className={mine ? 'text-primary-ink' : 'text-ink'}>
                        {item.body}
                      </Text>
                    </View>
                  ) : null}
                  <SharedBookmarkCard
                    messageId={item.id}
                    snapshot={item.sharedBookmark as unknown as SharedBookmarkSnapshot}
                    mine={mine}
                  />
                </View>
              );
            }
            return (
              <View
                className={`max-w-[78%] rounded-skin px-3 py-2 ${
                  mine
                    ? 'self-end bg-primary'
                    : 'self-start border-skin border-border bg-panel'
                }`}>
                <Text className={mine ? 'text-primary-ink' : 'text-ink'}>{item.body}</Text>
              </View>
            );
          }}
        />

        {canSend ? (
          <View
            className="flex-row items-center gap-2 border-t border-border px-3 py-2"
            style={{ paddingBottom: 8 + (keyboardShown ? 0 : insets.bottom) }}>
            <TextInput
              className="flex-1 rounded-skin border-skin border-border bg-panel px-4 py-2.5 font-sans text-ink"
              placeholder="Message…"
              placeholderTextColor={t.muted}
              value={body}
              onChangeText={setBody}
              multiline
            />
            <Pressable
              className="rounded-full bg-primary p-2.5"
              disabled={sending || !body.trim()}
              onPress={send}>
              {sending ? (
                <ActivityIndicator color={t.primaryInk} />
              ) : (
                <Ionicons name="arrow-up" size={18} color={t.primaryInk} />
              )}
            </Pressable>
          </View>
        ) : (
          <View
            className="border-t border-border px-4 py-3"
            style={{ paddingBottom: 12 + (keyboardShown ? 0 : insets.bottom) }}>
            <Text className="text-center text-sm text-muted">
              You&apos;re no longer friends — add them again to keep messaging.
            </Text>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
