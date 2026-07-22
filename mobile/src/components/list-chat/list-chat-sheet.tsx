import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import {
  BottomSheetFlatList,
  BottomSheetModal,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { trpc } from '@/client/api';
import { subscribeListChat, realtimeEnabled } from '@/client/realtime';
import { authClient } from '@/client/auth';
import { ReportSheet } from '@/components/report-sheet';
import { atHandle } from '@/lib/handle';
import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';

type MessagesPage = Awaited<ReturnType<typeof trpc.listChat.messages.query>>;
type ChatMessage = MessagesPage['messages'][number];

function timeAgo(value: Date | string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (s < 60) return 'now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(value).toLocaleDateString();
}

const ROLE_LABEL: Record<string, string> = {
  OWNER: 'owner',
  COLLABORATOR: 'collaborator',
  VIEWER: 'viewer',
};

/**
 * The list chatroom, rendered in a 70% bottom sheet. Mirrors the DM thread screen: loads older
 * history on demand (keyset cursor), refreshes the newest page off the list's realtime channel
 * (polling fallback), and marks read while open. Any member can post; only the owner can clear.
 * The parent presents/dismisses via the forwarded ref and clears its badge through `onRead`.
 */
export const ListChatSheet = forwardRef<
  BottomSheetModal,
  { listId: string; isOwner: boolean; canSend: boolean; onRead?: () => void }
>(function ListChatSheet({ listId, isOwner, canSend, onRead }, ref) {
  const t = THEME_TOKENS[useTheme().theme];
  const myId = authClient.useSession().data?.user.id ?? '';
  const insets = useSafeAreaInsets();
  // The sheet's bottom edge reaches the screen bottom, so the composer needs the safe-area
  // inset to clear the home indicator — but only when the keyboard is hidden; once it's up
  // the keyboard already covers that area (adding the inset then would double-space).
  const [keyboardShown, setKeyboardShown] = useState(false);

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const listRef = useRef<React.ComponentRef<typeof BottomSheetFlatList>>(null);

  const mergeNewest = useCallback((incoming: ChatMessage[]) => {
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
    trpc.listChat.messages
      .query({ listId })
      .then((p) => {
        // Replace (not merge): an owner clear empties the room for everyone.
        setMessages(p.messages);
        setOlderCursor(p.nextCursor);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [listId]);

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

  // While open: catch up + mark read on ping, else poll as a fallback.
  useEffect(() => {
    if (!open) return;
    refreshNewest();
    trpc.listChat.markRead.mutate({ listId }).catch(() => {});
    onRead?.();
    const unsub = subscribeListChat(listId, () => {
      refreshNewest();
      trpc.listChat.markRead.mutate({ listId }).catch(() => {});
    });
    const id = setInterval(refreshNewest, realtimeEnabled() ? 20000 : 5000);
    return () => {
      unsub();
      clearInterval(id);
    };
  }, [open, listId, refreshNewest, onRead]);

  async function loadOlder() {
    if (!olderCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const p = await trpc.listChat.messages.query({ listId, cursor: olderCursor });
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
      const res = await trpc.listChat.send.mutate({ listId, body: text });
      if ('message' in res && res.message) {
        setBody('');
        mergeNewest([{ ...res.message, sender: null, role: null }]);
        refreshNewest();
      }
    } catch {
      // swallow — the composer keeps the text so the user can retry
    }
    setSending(false);
  }

  function confirmClear() {
    Alert.alert(
      'Clear chat history?',
      'This permanently deletes every message in this chat for everyone. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear all',
          style: 'destructive',
          onPress: async () => {
            try {
              await trpc.listChat.clear.mutate({ listId });
              setMessages([]);
              setOlderCursor(null);
            } catch {
              // ignore
            }
          },
        },
      ],
    );
  }

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={['70%']}
      enableDynamicSizing={false}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      onChange={(index) => setOpen(index >= 0)}
      backgroundStyle={{ backgroundColor: t.panel }}
      handleIndicatorStyle={{ backgroundColor: t.muted }}>
      <View style={{ flex: 1 }}>
        <View className="flex-row items-center justify-between px-4 pb-2">
          <Text className="font-serif text-lg text-ink">Chat</Text>
          {isOwner && (
            <Pressable
              accessibilityLabel="Clear chat history"
              hitSlop={8}
              onPress={confirmClear}
              className="flex-row items-center gap-1 p-1">
              <Ionicons name="trash-outline" size={16} color={t.danger} />
              <Text className="font-sans text-sm text-danger">Clear</Text>
            </Pressable>
          )}
        </View>

        <BottomSheetFlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m: ChatMessage) => m.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          onContentSizeChange={() =>
            listRef.current?.scrollToEnd({ animated: false })
          }
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
                No messages yet — start the conversation 💬
              </Text>
            ) : (
              <ActivityIndicator style={{ marginTop: 32 }} />
            )
          }
          renderItem={({ item }: { item: ChatMessage }) => {
            const mine = item.senderId === myId;
            const roleLabel = item.role ? ROLE_LABEL[item.role] : null;
            return (
              <View className={mine ? 'items-end' : 'items-start'}>
                {!mine && (
                  <Text className="mb-0.5 px-1 font-sans text-xs text-muted">
                    {atHandle(item.sender?.handle)}
                    {roleLabel ? (
                      <Text className="text-muted opacity-60"> · {roleLabel}</Text>
                    ) : null}
                  </Text>
                )}
                <Pressable
                  onLongPress={
                    mine ? undefined : () => setReportId(item.id)
                  }
                  className={`max-w-[80%] rounded-skin px-3 py-2 ${
                    mine
                      ? 'self-end bg-primary'
                      : 'self-start border-skin border-border bg-panel'
                  }`}>
                  <Text className={mine ? 'text-primary-ink' : 'text-ink'}>
                    {item.body}
                  </Text>
                </Pressable>
                <Text className="mt-0.5 px-1 font-sans text-[10px] text-muted opacity-70">
                  {timeAgo(item.createdAt)}
                </Text>
              </View>
            );
          }}
        />

        {canSend ? (
          <View
            className="flex-row items-center gap-2 border-t border-border px-3 py-2"
            style={{ paddingBottom: 8 + (keyboardShown ? 0 : insets.bottom) }}>
            <BottomSheetTextInput
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
              Only members can post in this chat.
            </Text>
          </View>
        )}
      </View>
      <ReportSheet
        visible={reportId !== null}
        onClose={() => setReportId(null)}
        targetType="LIST_CHAT_MESSAGE"
        targetId={reportId ?? ''}
        title="Report message"
      />
    </BottomSheetModal>
  );
});
