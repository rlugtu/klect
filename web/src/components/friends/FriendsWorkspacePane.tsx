"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { MessageCircle, MessageSquarePlus, Trash2, Users } from "lucide-react";
import {
  clearConversation,
  loadConversations,
  type DmConversation,
} from "@/lib/actions/dms";
import {
  acceptFriendRequest,
  cancelFriendRequest,
  declineFriendRequest,
} from "@/lib/actions/friends";
import { subscribeDm, realtimeEnabled } from "@/lib/realtime/client";
import { useIsDesktop } from "@/lib/client-prefs";
import { atHandle } from "@/lib/handle";
import { toast } from "@/lib/toast";
import { cn, timeAgo } from "@/lib/utils";
import { AddFriendForm } from "@/components/friends/AddFriendForm";
import { FriendRow } from "@/components/friends/FriendRow";
import { MessageFriendButton } from "@/components/dms/MessageFriendButton";
import { PixelButton } from "@/components/ui/PixelButton";
import { UserIcon } from "@/components/ui/UserIcon";

type PublicUser = { id: string; handle: string | null; icon: string | null };
type Request = { id: string; user: PublicUser };
type Tab = "messages" | "friends";

/**
 * Left pane of the lg+ messages workspace (rendered by friends/layout.tsx).
 *
 * A Messages | Friends switch over two panels:
 * - Messages: "New chat" and the inbox. Rows link to /friends/dms/[id], so
 *   picking one is a real navigation (back button, direct load and sharing all
 *   work) while this pane stays mounted. The open row is highlighted and never
 *   shows as unread (the thread marks it read on open).
 * - Friends: add by @handle, incoming requests (accept / decline), sent
 *   requests (withdraw), and the friends list (the existing FriendRow, so
 *   remove and add-to-lists stay here, plus a Message button).
 *
 * The switch follows the URL (/friends/dms* opens Messages, anything else
 * Friends) until the user flips it, and resets on the next navigation.
 *
 * Live data: the inbox refreshes off the user's realtime channel and the open
 * conversation's channel, polling as a fallback, the same pattern as DmInbox.
 * That only runs at lg+, since below lg this pane is display:none.
 */
export function FriendsWorkspacePane({
  myId,
  conversations,
  friends,
  ownedLists,
  memberMap,
  incoming,
  outgoing,
}: {
  myId: string;
  conversations: DmConversation[];
  friends: { friendshipId: string; friend: PublicUser }[];
  ownedLists: { id: string; name: string; icon: string }[];
  memberMap: Record<string, string[]>;
  incoming: Request[];
  outgoing: Request[];
}) {
  const pathname = usePathname();
  const routeTab: Tab = pathname.startsWith("/friends/dms") ? "messages" : "friends";
  const [picked, setPicked] = useState<{ path: string; tab: Tab } | null>(null);
  const tab = picked && picked.path === pathname ? picked.tab : routeTab;

  const match = /^\/friends\/dms\/([^/]+)$/.exec(pathname);
  const activeId = match && match[1] !== "new" ? match[1] : null;

  const convos = useLiveConversations(myId, conversations, activeId);
  const unread = convos.filter(
    (c) => c.unread && c.conversationId !== activeId,
  ).length;

  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({
    messages: null,
    friends: null,
  });

  function select(next: Tab) {
    setPicked({ path: pathname, tab: next });
  }

  function onTabKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const next: Tab =
      e.key === "Home" ? "messages" : e.key === "End" ? "friends" : tab === "messages" ? "friends" : "messages";
    select(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <>
      <div className="flex flex-col gap-3 p-4 pb-3">
        <div
          role="tablist"
          aria-label="Messages and friends"
          className="ws-seg grid grid-cols-2 gap-1 p-1"
        >
          <SegTab
            id="ws-tab-messages"
            panelId="ws-panel-messages"
            on={tab === "messages"}
            onSelect={() => select("messages")}
            onKeyDown={onTabKey}
            buttonRef={(el) => {
              tabRefs.current.messages = el;
            }}
            count={unread}
            countLabel="unread"
          >
            <MessageCircle size={14} aria-hidden /> Messages
          </SegTab>
          <SegTab
            id="ws-tab-friends"
            panelId="ws-panel-friends"
            on={tab === "friends"}
            onSelect={() => select("friends")}
            onKeyDown={onTabKey}
            buttonRef={(el) => {
              tabRefs.current.friends = el;
            }}
            count={incoming.length}
            countLabel="friend requests"
          >
            <Users size={14} aria-hidden /> Friends
          </SegTab>
        </div>

        {tab === "messages" ? (
          <Link href="/friends/dms/new" className="self-start">
            <PixelButton size="sm" tabIndex={-1}>
              <MessageSquarePlus size={14} aria-hidden /> New chat
            </PixelButton>
          </Link>
        ) : (
          <AddFriendForm inline />
        )}
      </div>

      {/* Both panels stay mounted (the inactive one `hidden`), so a half-open
          friend row or delete confirm survives a switch. */}
      <div
        role="tabpanel"
        id="ws-panel-messages"
        aria-labelledby="ws-tab-messages"
        hidden={tab !== "messages"}
        className="ws-divider min-h-0 flex-1 overflow-y-auto"
      >
        <ConversationList convos={convos} activeId={activeId} />
      </div>
      <div
        role="tabpanel"
        id="ws-panel-friends"
        aria-labelledby="ws-tab-friends"
        hidden={tab !== "friends"}
        className="ws-divider min-h-0 flex-1 overflow-y-auto"
      >
        <FriendsPanel
          friends={friends}
          ownedLists={ownedLists}
          memberMap={memberMap}
          incoming={incoming}
          outgoing={outgoing}
        />
      </div>
    </>
  );
}

/** Inbox state that stays fresh while the pane is mounted at lg+. */
function useLiveConversations(
  myId: string,
  initial: DmConversation[],
  activeId: string | null,
) {
  const isDesktop = useIsDesktop();
  const [state, setState] = useState({ initial, convos: initial });
  // A server refresh (revalidating action, router.refresh) hands in a new
  // initial list; adopt it instead of keeping the stale client copy.
  let convos = state.convos;
  if (state.initial !== initial) {
    convos = initial;
    setState({ initial, convos: initial });
  }

  useEffect(() => {
    if (!isDesktop) return;
    let alive = true;
    const refresh = () =>
      loadConversations()
        .then((c) => alive && setState((s) => ({ ...s, convos: c })))
        .catch(() => {});
    // Pull once on every conversation switch: the thread just marked itself
    // read, and the sender's own inbox gets no realtime ping for its send.
    refresh();
    const unsubs = [subscribeDm(`dm:user:${myId}`, refresh)];
    if (activeId) unsubs.push(subscribeDm(`dm:conv:${activeId}`, refresh));
    const id = setInterval(refresh, realtimeEnabled() ? 20000 : 5000);
    return () => {
      alive = false;
      for (const u of unsubs) u();
      clearInterval(id);
    };
  }, [myId, activeId, isDesktop]);

  return convos;
}

function SegTab({
  id,
  panelId,
  on,
  onSelect,
  onKeyDown,
  buttonRef,
  count,
  countLabel,
  children,
}: {
  id: string;
  panelId: string;
  on: boolean;
  onSelect: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
  buttonRef: (el: HTMLButtonElement | null) => void;
  count: number;
  countLabel: string;
  children: React.ReactNode;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      role="tab"
      id={id}
      aria-selected={on}
      aria-controls={panelId}
      tabIndex={on ? 0 : -1}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      className={cn(
        "ws-seg-tab flex cursor-pointer items-center justify-center gap-2 px-2 py-1.5 text-sm font-semibold",
        on ? "bg-primary text-primary-ink" : "text-muted hover:text-ink",
      )}
    >
      {children}
      {count > 0 && (
        <span
          className={cn(
            "min-w-5 rounded-full px-1.5 text-center text-xs leading-5",
            on ? "bg-primary-ink text-primary" : "bg-accent text-primary-ink",
          )}
        >
          {count}
          <span className="sr-only"> {countLabel}</span>
        </span>
      )}
    </button>
  );
}

function ConversationList({
  convos,
  activeId,
}: {
  convos: DmConversation[];
  activeId: string | null;
}) {
  const router = useRouter();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const visible = convos.filter((c) => !hidden.has(c.conversationId));

  async function onDelete(conversationId: string) {
    setHidden((cur) => new Set(cur).add(conversationId));
    try {
      await clearConversation(conversationId);
      toast.success("Chat deleted.");
      if (conversationId === activeId) router.push("/friends/dms");
    } catch {
      setHidden((cur) => {
        const next = new Set(cur);
        next.delete(conversationId);
        return next;
      });
      toast.error("Couldn't delete the chat.");
    }
  }

  if (visible.length === 0) {
    return (
      <p className="text-muted p-4 text-sm">
        No conversations yet. Start one with New chat, or message a friend from
        the Friends tab.
      </p>
    );
  }

  return (
    <ul className="flex flex-col">
      {visible.map((c) => (
        <ConversationRow
          key={c.conversationId}
          convo={c}
          active={c.conversationId === activeId}
          onDelete={onDelete}
        />
      ))}
    </ul>
  );
}

function ConversationRow({
  convo,
  active,
  onDelete,
}: {
  convo: DmConversation;
  active: boolean;
  onDelete: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const name = atHandle(convo.other.handle);
  const mine = convo.lastMessage.senderId !== convo.other.id;
  const unread = convo.unread && !active;
  const preview =
    convo.lastMessage.type === "BOOKMARK"
      ? convo.lastMessage.body || "Shared a bookmark"
      : convo.lastMessage.body;

  return (
    <li className={cn("ws-row flex items-center gap-2 pr-2", active && "ws-row-on")}>
      <Link
        href={`/friends/dms/${convo.conversationId}`}
        aria-current={active ? "page" : undefined}
        className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4"
      >
        <UserIcon icon={convo.other.icon} className="shell-thumb-empty pixel-box-sm flex size-10 shrink-0 items-center justify-center text-xl" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-semibold">{name}</span>
            <span className="text-muted shrink-0 text-xs" suppressHydrationWarning>
              {timeAgo(convo.lastMessageAt)}
            </span>
          </span>
          <span
            className={cn(
              "truncate text-sm",
              unread ? "text-ink font-semibold" : "text-muted",
            )}
          >
            {mine && "You: "}
            {preview}
          </span>
        </span>
        {unread && (
          <span className="bg-accent size-2.5 shrink-0 rounded-full">
            <span className="sr-only">Unread</span>
          </span>
        )}
      </Link>

      {confirming ? (
        <span className="flex shrink-0 flex-col items-stretch gap-1">
          <PixelButton
            variant="danger"
            size="xs"
            onClick={() => onDelete(convo.conversationId)}
          >
            Delete
          </PixelButton>
          <PixelButton
            variant="secondary"
            size="xs"
            onClick={() => setConfirming(false)}
          >
            Cancel
          </PixelButton>
        </span>
      ) : (
        <button
          type="button"
          aria-label={`Delete chat with ${name}`}
          title="Delete chat"
          onClick={() => setConfirming(true)}
          className="text-muted hover:text-danger shrink-0 cursor-pointer p-1.5"
        >
          <Trash2 size={14} aria-hidden />
        </button>
      )}
    </li>
  );
}

function FriendsPanel({
  friends,
  ownedLists,
  memberMap,
  incoming,
  outgoing,
}: {
  friends: { friendshipId: string; friend: PublicUser }[];
  ownedLists: { id: string; name: string; icon: string }[];
  memberMap: Record<string, string[]>;
  incoming: Request[];
  outgoing: Request[];
}) {
  return (
    <div className="flex flex-col gap-5 p-4">
      {incoming.length > 0 && (
        <PaneSection title="Requests" count={incoming.length}>
          {incoming.map((r) => (
            <RequestRow key={r.id} request={r} kind="incoming" />
          ))}
        </PaneSection>
      )}

      {outgoing.length > 0 && (
        <PaneSection title="Pending" count={outgoing.length}>
          {outgoing.map((r) => (
            <RequestRow key={r.id} request={r} kind="outgoing" />
          ))}
        </PaneSection>
      )}

      <PaneSection title="Friends" count={friends.length}>
        {friends.length === 0 ? (
          <p className="text-muted text-sm">
            No friends yet. Add someone by @handle above.
          </p>
        ) : (
          friends.map((f) => (
            <FriendRow
              key={f.friendshipId}
              friendshipId={f.friendshipId}
              friend={f.friend}
              lists={ownedLists}
              memberListIds={memberMap[f.friend.id] ?? []}
              narrow
              actions={
                <MessageFriendButton
                  userId={f.friend.id}
                  handle={f.friend.handle}
                  iconOnly
                  size="xs"
                />
              }
            />
          ))
        )}
      </PaneSection>
    </div>
  );
}

function PaneSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <h2 className="font-pixel text-muted text-xs">
        {title} ({count})
      </h2>
      {children}
    </section>
  );
}

/**
 * One friend request: incoming gets Accept / Decline, outgoing gets Withdraw.
 * The existing friend actions do the work (and their revalidation refreshes
 * this pane); the row hides itself straight away and toasts the result.
 */
function RequestRow({
  request,
  kind,
}: {
  request: Request;
  kind: "incoming" | "outgoing";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  if (done) return null;

  function run(action: () => Promise<void>, success: string, failure: string) {
    startTransition(async () => {
      try {
        await action();
        setDone(true);
        toast.success(success);
        router.refresh();
      } catch {
        toast.error(failure);
      }
    });
  }

  return (
    <div className="pixel-box-sm bg-panel flex flex-wrap items-center justify-end gap-2 p-2.5">
      <Link
        href={`/users/${request.user.handle ?? request.user.id}`}
        className="hover:text-primary flex min-w-24 flex-1 items-center gap-2"
      >
        <UserIcon icon={request.user.icon} className="text-lg" />
        <span className="truncate text-sm font-semibold">
          {atHandle(request.user.handle)}
        </span>
      </Link>
      {kind === "incoming" ? (
        <>
          <PixelButton
            size="xs"
            disabled={pending}
            onClick={() =>
              run(
                () => acceptFriendRequest(request.id),
                "Friend request accepted.",
                "Couldn't accept the request.",
              )
            }
          >
            Accept
          </PixelButton>
          <PixelButton
            size="xs"
            variant="secondary"
            disabled={pending}
            onClick={() =>
              run(
                () => declineFriendRequest(request.id),
                "Friend request declined.",
                "Couldn't decline the request.",
              )
            }
          >
            Decline
          </PixelButton>
        </>
      ) : (
        <PixelButton
          size="xs"
          variant="secondary"
          disabled={pending}
          onClick={() =>
            run(
              () => cancelFriendRequest(request.id),
              "Request withdrawn.",
              "Couldn't withdraw the request.",
            )
          }
        >
          Withdraw
        </PixelButton>
      )}
    </div>
  );
}
