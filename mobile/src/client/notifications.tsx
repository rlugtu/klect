import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

import { trpc } from '@/client/api';
import { authClient } from '@/client/auth';
import { setBadgeCount } from '@/client/push';
import { realtimeEnabled, subscribeDm } from '@/client/realtime';

type Attention = {
  /** Conversations with an unread message. */
  dmUnread: number;
  /** Pending incoming friend requests. */
  friendRequests: number;
};

const AttentionContext = createContext<Attention>({ dmUnread: 0, friendRequests: 0 });

/** Combined attention count that drives the Friends tab's navbar badge. */
export function useAttention() {
  return useContext(AttentionContext);
}

/**
 * Polls the two "needs your attention" counts — unread DMs and incoming friend requests —
 * so the Friends tab can show a badge from anywhere in the app. Reuses the DM realtime
 * channel as a refetch signal (polling fallback), and refreshes when the app returns to the
 * foreground. Mounted around the tab navigator; degrades quietly when queries fail.
 */
export function AttentionProvider({ children }: { children: ReactNode }) {
  const myId = authClient.useSession().data?.user.id ?? '';
  const [dmUnread, setDmUnread] = useState(0);
  const [friendRequests, setFriendRequests] = useState(0);

  const refresh = useCallback(() => {
    trpc.dms.unreadCount.query().then(setDmUnread).catch(() => {});
    trpc.friends.list
      .query()
      .then((d) => setFriendRequests(d.incoming.length))
      .catch(() => {});
    // Keep the iOS app-icon badge in sync with the server-authoritative count (unread DMs
    // + friend requests + pending list invites) — the same value pushes carry.
    trpc.notifications.badgeCount
      .query()
      .then(setBadgeCount)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!myId) return;
    refresh();
    const unsub = subscribeDm(`dm:user:${myId}`, refresh);
    const id = setInterval(refresh, realtimeEnabled() ? 20000 : 5000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => {
      unsub();
      clearInterval(id);
      sub.remove();
    };
  }, [myId, refresh]);

  return (
    <AttentionContext.Provider value={{ dmUnread, friendRequests }}>
      {children}
    </AttentionContext.Provider>
  );
}
