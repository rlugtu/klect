import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  Switch,
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
import { BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { useHeaderHeight } from '@react-navigation/elements';
import { Ionicons } from '@expo/vector-icons';

import { trpc } from '@/client/api';
import { authClient } from '@/client/auth';
import { toast } from '@/client/toast';
import { subscribeListChat, realtimeEnabled } from '@/client/realtime';
import CommentsSection, { type CommentItem } from '@/components/comments-section';
import { ListChatSheet } from '@/components/list-chat/list-chat-sheet';
import LockedBadge, {
  LockedNotice,
  LOCKED_OPACITY,
} from '@/components/locked-badge';
import PhotoCard from '@/components/photo-card';
import PollRow from '@/components/poll-row';
import RatingStars from '@/components/rating-stars';
import Skeleton from '@/components/skeleton';
import TagPill from '@/components/tag-pill';
import ListMembers from '@/components/list-members';
import { screenshotThumbUrl, videoPosterUrl } from '@/lib/video-embed';
import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';

// Inferred from web's tRPC procedures.
type Bookmarks = Awaited<ReturnType<typeof trpc.bookmarks.forList.query>>;
type Polls = Awaited<ReturnType<typeof trpc.polls.forList.query>>;
type ListAccess = Awaited<ReturnType<typeof trpc.lists.get.query>>;

export default function ListScreen() {
  const router = useRouter();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const myId = authClient.useSession().data?.user.id;
  const t = THEME_TOKENS[useTheme().theme];
  const headerHeight = useHeaderHeight();
  const sheetRef = useRef<BottomSheetModal>(null);
  const actionsSheetRef = useRef<BottomSheetModal>(null);
  const chatSheetRef = useRef<BottomSheetModal>(null);
  const [chatUnread, setChatUnread] = useState(0);

  const [bookmarks, setBookmarks] = useState<Bookmarks>([]);
  const [polls, setPolls] = useState<Polls>([]);
  const [access, setAccess] = useState<ListAccess>(null);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  // Off by default → all bookmarks; on → only those the user hasn't visited.
  const [hideVisited, setHideVisited] = useState(false);
  // Which face of the list view is showing — bookmarks, members, or its polls.
  // Rendered inline (no route change) so the header/details/tabs stay put.
  const [tab, setTab] = useState<'list' | 'members' | 'polls'>('list');
  const [error, setError] = useState<string | null>(null);
  // Separate from `error` (which covers the bookmarks fetch): if the access check
  // itself fails we can't tell a public list from a deleted/private/unreachable one,
  // so the screen must say so instead of falling through to the public-list UI.
  const [accessError, setAccessError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadComments = useCallback(() => {
    if (!id) return;
    trpc.comments.forList.query({ listId: id }).then(setComments).catch(() => {});
  }, [id]);

  const loadBookmarks = useCallback(() => {
    if (!id) return;
    setLoading(true);
    trpc.bookmarks.forList
      .query({ listId: id })
      .then(setBookmarks)
      .catch((e) => setError(e instanceof Error ? e.message : 'Request failed'))
      .finally(() => setLoading(false));
  }, [id]);

  const loadPolls = useCallback(() => {
    if (!id) return;
    trpc.polls.forList.query({ listId: id }).then(setPolls).catch(() => {});
  }, [id]);

  // Unread chat count for the header chat-icon badge. Safe to call for non-members
  // (the procedure returns 0 for them); the icon itself only renders for members.
  const loadChatUnread = useCallback(() => {
    if (!id) return;
    trpc.listChat.unread.query({ listId: id }).then(setChatUnread).catch(() => {});
  }, [id]);

  // Distinct tags present across the list's bookmarks (for the filter sheet).
  const availableTags = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color: string }>();
    for (const b of bookmarks) for (const bt of b.tags) map.set(bt.tag.id, bt.tag);
    return [...map.values()];
  }, [bookmarks]);

  // Name search (substring) AND tag filter (OR across selected tags) AND
  // an optional "show only unvisited" filter, all applied together.
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bookmarks.filter(
      (b) =>
        (q === '' || b.name.toLowerCase().includes(q)) &&
        (selected.size === 0 || b.tags.some((bt) => selected.has(bt.tag.id))) &&
        (!hideVisited || !b.visited),
    );
  }, [bookmarks, selected, query, hideVisited]);

  function toggleTag(tagId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  }

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      loadBookmarks();
      loadPolls();
      trpc.lists.get
        .query({ listId: id })
        .then((a) => {
          setAccess(a);
          setAccessError(null);
        })
        .catch((e) =>
          setAccessError(e instanceof Error ? e.message : 'Request failed'),
        );
      loadComments();
      loadChatUnread();
    }, [id, loadBookmarks, loadPolls, loadComments, loadChatUnread]),
  );

  // Keep the chat badge live off the list's realtime channel (polling fallback).
  useEffect(() => {
    if (!id) return;
    const unsub = subscribeListChat(id, loadChatUnread);
    const iv = setInterval(loadChatUnread, realtimeEnabled() ? 20000 : 5000);
    return () => {
      unsub();
      clearInterval(iv);
    };
  }, [id, loadChatUnread]);

  function confirmClear() {
    if (!id) return;
    Alert.alert(
      'Clear all bookmarks?',
      'This deletes every bookmark in this list. The list itself stays. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear all',
          style: 'destructive',
          onPress: async () => {
            try {
              await trpc.lists.clearBookmarks.mutate({ listId: id });
              loadBookmarks();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Clear failed');
            }
          },
        },
      ],
    );
  }

  // Remove a tag from every bookmark in the list (collaborators). Confirms with
  // the affected count, then clears any active filter on that tag and reloads.
  function confirmRemoveTag(name: string) {
    if (!id) return;
    const n = bookmarks.filter((b) =>
      b.tags.some((bt) => bt.tag.name === name),
    ).length;
    Alert.alert(
      `Remove #${name.toLowerCase()}?`,
      `This removes it from ${n} ${n === 1 ? 'bookmark' : 'bookmarks'} in this list. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await trpc.tags.removeFromList.mutate({ listId: id, name });
              setSelected((prev) => {
                const next = new Set(prev);
                for (const tag of availableTags)
                  if (tag.name === name) next.delete(tag.id);
                return next;
              });
              toast.success(`Removed #${name.toLowerCase()} from this list`);
              loadBookmarks();
            } catch (e) {
              toast.error(
                e instanceof Error ? e.message : 'Could not remove tag',
              );
            }
          },
        },
      ],
    );
  }

  const selectedTags = availableTags.filter((tag) => selected.has(tag.id));

  // With any filter active, an empty result means "nothing matched" rather than
  // "this list is empty" — the two need different empty states.
  const filtering = query.trim() !== '' || selected.size > 0 || hideVisited;

  // Params only carry a name when the list was opened from a list card; a push
  // notification or deep link arrives without one, so fall back to the fetched list.
  const listName = name ?? access?.list.name ?? 'List';
  const description = access?.list.description ?? '';
  const isMember = access?.isMember ?? false;
  const isOwner = isMember && access?.role === 'OWNER';
  const canEdit =
    isMember && (access?.role === 'OWNER' || access?.role === 'COLLABORATOR');

  // Frozen by the free-tier downgrade flow (`lockedAt` stamped by
  // `core.selectActiveLists`). A locked list is wholly read-only, so every
  // add/modify affordance below branches on `canWrite` rather than `canEdit`:
  // role says who may write, the lock says whether anyone may.
  //
  // Deletes are deliberately NOT gated. "Clear list", deleting the list, and
  // deleting a bookmark stay live on a locked target, because trimming your own
  // content is the only way back under the free cap without paying (see the
  // `LockedError` note in web/src/lib/core/lists.ts).
  const listLocked = access?.list.lockedAt != null;
  const canWrite = canEdit && !listLocked;

  if (accessError) {
    return (
      <View className="flex-1 items-center justify-center gap-1 bg-bg p-6">
        <Stack.Screen options={{ headerTitle: '' }} />
        <Text className="font-serif text-xl text-ink">
          Couldn&apos;t load this list
        </Text>
        <Text className="text-center font-sans text-danger">{accessError}</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-bg">
      <Stack.Screen
        options={{
          headerTitle: '',
          // The chatroom entry point. The "add bookmark" action moved to the list-name
          // row below (louder button, before the ⋮ actions). Members only.
          headerRight: () =>
            isMember ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`List chat${
                  chatUnread > 0 ? `, ${chatUnread} unread` : ''
                }`}
                hitSlop={8}
                onPress={() => {
                  setChatUnread(0);
                  chatSheetRef.current?.present();
                }}
                style={{
                  width: 34,
                  height: 34,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <Ionicons name="chatbubbles-outline" size={24} color={t.primary} />
                {chatUnread > 0 && (
                  <View
                    style={{
                      position: 'absolute',
                      top: -2,
                      right: -4,
                      minWidth: 16,
                      height: 16,
                      borderRadius: 8,
                      paddingHorizontal: 3,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: t.danger,
                    }}>
                    {/* primaryInk is the token for text on a filled surface — it flips
                        to near-black in the dark themes, where `danger` is a light red. */}
                    <Text
                      style={{ color: t.primaryInk, fontSize: 10, fontWeight: '700' }}>
                      {chatUnread > 99 ? '99+' : chatUnread}
                    </Text>
                  </View>
                )}
              </Pressable>
            ) : null,
        }}
      />

      <FlatList
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        data={
          (tab === 'list' ? shown : tab === 'polls' ? polls : []) as (
            | Bookmarks[number]
            | Polls[number]
          )[]
        }
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          padding: 16,
          paddingTop: headerHeight + 8,
          gap: tab === 'list' ? 16 : 12,
          paddingBottom: 24,
        }}
        ListHeaderComponent={
          <View className="gap-3 pb-1">
            <View className="flex-row items-center justify-between gap-3">
              <Text className="flex-1 font-serif text-3xl text-ink">
                {listName}
              </Text>
              {isMember && (
                <View className="flex-row items-center gap-2">
                  {canEdit && (
                    // Louder filled "New bookmark" action, before the ⋮ list actions.
                    // On a locked list it stays put but goes visibly dead (dimmed,
                    // lock glyph, not pressable) rather than disappearing or
                    // tapping through to a form the server would refuse.
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        listLocked
                          ? 'Add bookmark, unavailable while this list is locked'
                          : 'Add bookmark'
                      }
                      accessibilityState={{ disabled: listLocked }}
                      disabled={listLocked}
                      hitSlop={8}
                      onPress={() =>
                        router.push({
                          pathname: '/bookmarks/new',
                          params: { listId: id, listName: name },
                        })
                      }
                      style={listLocked ? { opacity: LOCKED_OPACITY } : undefined}
                      className="flex-row items-center gap-1 rounded-full bg-primary px-3 py-1.5">
                      <Ionicons
                        name={listLocked ? 'lock-closed' : 'add'}
                        size={16}
                        color={t.primaryInk}
                      />
                      <Text className="font-sans-semibold text-sm text-primary-ink">
                        New
                      </Text>
                    </Pressable>
                  )}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="List actions"
                    hitSlop={8}
                    onPress={() => actionsSheetRef.current?.present()}
                    className="p-1">
                    <Ionicons name="ellipsis-vertical" size={22} color={t.ink} />
                  </Pressable>
                </View>
              )}
            </View>

            {description.trim() !== '' && (
              <Text className="font-sans text-muted">{description}</Text>
            )}

            {!isMember && (
              <View className="flex-row items-center gap-1.5 rounded-skin border-skin border-border px-3 py-2">
                <Ionicons name="globe-outline" size={14} color={t.muted} />
                <Text className="font-sans text-sm text-muted">
                  Public list · view only
                </Text>
              </View>
            )}

            {/* Why every edit control on this screen is dead. Sits in the same slot
                and the same shape as the public-list notice above. */}
            {listLocked && <LockedNotice kind="list" />}

            {isMember && (
              // Rounded-pill segmented control, echoing the floating nav bar.
              <View className="flex-row self-center rounded-full border-skin border-border bg-panel p-1">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="List"
                  accessibilityState={{ selected: tab === 'list' }}
                  onPress={() => setTab('list')}
                  className={`flex-row items-center gap-1.5 rounded-full px-4 py-1.5 ${
                    tab === 'list' ? 'bg-primary' : ''
                  }`}>
                  <Ionicons
                    name="list"
                    size={16}
                    color={tab === 'list' ? t.primaryInk : t.muted}
                  />
                  <Text
                    className={
                      tab === 'list'
                        ? 'font-sans-semibold text-primary-ink'
                        : 'font-sans text-muted'
                    }>
                    List
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Members"
                  accessibilityState={{ selected: tab === 'members' }}
                  onPress={() => setTab('members')}
                  className={`flex-row items-center gap-1.5 rounded-full px-4 py-1.5 ${
                    tab === 'members' ? 'bg-primary' : ''
                  }`}>
                  <Ionicons
                    name="people"
                    size={16}
                    color={tab === 'members' ? t.primaryInk : t.muted}
                  />
                  <Text
                    className={
                      tab === 'members'
                        ? 'font-sans-semibold text-primary-ink'
                        : 'font-sans text-muted'
                    }>
                    Members
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Polls"
                  accessibilityState={{ selected: tab === 'polls' }}
                  onPress={() => setTab('polls')}
                  className={`flex-row items-center gap-1.5 rounded-full px-4 py-1.5 ${
                    tab === 'polls' ? 'bg-primary' : ''
                  }`}>
                  <Ionicons
                    name="bar-chart"
                    size={16}
                    color={tab === 'polls' ? t.primaryInk : t.muted}
                  />
                  <Text
                    className={
                      tab === 'polls'
                        ? 'font-sans-semibold text-primary-ink'
                        : 'font-sans text-muted'
                    }>
                    Polls
                  </Text>
                </Pressable>
              </View>
            )}

            {tab === 'list' ? (
              <>
                <View className="flex-row items-center justify-between">
                  <Text className="font-sans text-ink">Show only unvisited</Text>
                  <Switch
                    accessibilityLabel="Show only unvisited bookmarks"
                    value={hideVisited}
                    onValueChange={setHideVisited}
                    trackColor={{ true: t.primary, false: `${t.muted}66` }}
                    ios_backgroundColor={`${t.muted}66`}
                  />
                </View>

                <View className="flex-row items-center gap-2">
                  <TextInput
                    className="flex-1 rounded-skin border-skin border-border px-4 py-2.5 font-sans text-ink"
                    placeholder="Search bookmarks"
                    placeholderTextColor={t.muted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={query}
                    onChangeText={setQuery}
                  />
                  {availableTags.length > 0 && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Filter by tag"
                      onPress={() => sheetRef.current?.present()}
                      className="rounded-skin border-skin border-border px-3 py-2.5">
                      <Text className="font-sans-semibold text-ink">Tags ▾</Text>
                    </Pressable>
                  )}
                </View>

                {(selectedTags.length > 0 || query.trim() !== '') && (
                  <View className="flex-row flex-wrap items-center gap-1">
                    {selectedTags.map((tag) => (
                      <Pressable
                        key={tag.id}
                        accessibilityRole="button"
                        accessibilityLabel={`Clear the ${tag.name} filter`}
                        onPress={() => toggleTag(tag.id)}
                        className="px-1 py-0.5">
                        <Text className="font-sans text-sm text-muted">
                          #{tag.name.toLowerCase()} ✕
                        </Text>
                      </Pressable>
                    ))}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Clear all filters"
                      onPress={() => {
                        setSelected(new Set());
                        setQuery('');
                      }}
                      className="px-1">
                      <Text className="font-sans text-xs text-muted">Clear all</Text>
                    </Pressable>
                  </View>
                )}

                {loading && (
                  // Photo-card-shaped placeholders, same idiom as the poll screens.
                  <View className="gap-4">
                    <Skeleton height={180} />
                    <Skeleton height={180} />
                  </View>
                )}
                {error && <Text className="font-sans text-danger">{error}</Text>}
                {!loading && !error && shown.length === 0 && (
                  <Text className="font-serif-italic text-muted">
                    {filtering
                      ? 'No bookmarks match.'
                      : 'No bookmarks yet — add your first find.'}
                  </Text>
                )}
              </>
            ) : tab === 'members' ? (
              <ListMembers
                listId={id}
                isOwner={isOwner}
                onLeave={() => router.dismissAll()}
              />
            ) : (
              <>
                {/* `canWrite`, not `canEdit`: a poll is new content added to the
                    list, which a locked list can't take. */}
                {canWrite && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Create poll"
                    onPress={() =>
                      router.push({
                        pathname: '/polls/new',
                        params: { listId: id, listName: name },
                      })
                    }
                    className="items-center rounded-skin bg-primary py-3">
                    <Text className="font-sans-semibold text-primary-ink">
                      Create poll
                    </Text>
                  </Pressable>
                )}
                {polls.length === 0 && (
                  <Text className="font-serif-italic text-muted">
                    No polls yet.
                  </Text>
                )}
              </>
            )}
          </View>
        }
        ListFooterComponent={
          tab !== 'list' ? null : (
          <View className="mt-6">
            <CommentsSection
              comments={comments}
              currentUserId={myId}
              readOnly={!isMember}
              canModerate={isOwner}
              onAdd={async (value) => {
                if (!id) return;
                await trpc.comments.addToList.mutate({ listId: id, value });
                toast.success('Comment posted');
                loadComments();
              }}
              onDelete={async (commentId) => {
                await trpc.comments.delete.mutate({ commentId });
                loadComments();
              }}
            />
          </View>
          )
        }
        renderItem={({ item }) => {
          if (tab === 'polls') {
            const poll = item as Polls[number];
            return (
              <PollRow
                poll={poll}
                onPress={() =>
                  router.push({
                    pathname: '/polls/[pollId]',
                    params: { pollId: poll.id },
                  })
                }
              />
            );
          }
          const b = item as Bookmarks[number];
          // A bookmark is read-only when it's locked itself or when the whole list
          // is: `listIdOfWritableBookmark` refuses the edit either way, so the card
          // has to look the same either way. The pill is drawn in both cases rather
          // than only for the individually-locked ones: the list banner scrolls off
          // the top, and a dimmed card with no label is just ambiguous.
          const bookmarkLocked = listLocked || b.lockedAt != null;
          const dim = bookmarkLocked ? { opacity: LOCKED_OPACITY } : undefined;
          return (
            <PhotoCard
              // Never the video itself — always a static thumbnail. If the
              // extracted image is missing or fails (e.g. a hotlink-blocked reel
              // og:image), fall back to a YouTube poster or a page screenshot.
              image={b.images[0] ?? null}
              fallbackImage={
                videoPosterUrl(b.videoUrl, b.videoType) ??
                screenshotThumbUrl(b.urls[0])
              }
              dimmed={bookmarkLocked}
              onPress={() =>
                router.push({
                  pathname: '/bookmarks/[id]',
                  params: { id: b.id, name: b.name },
                })
              }>
              <View className="flex-row items-center gap-2">
                <Text className="flex-shrink font-serif text-lg text-ink" style={dim}>
                  {b.name}
                </Text>
                {bookmarkLocked && <LockedBadge />}
              </View>
              {b.description ? (
                <Text
                  className="font-sans text-sm text-muted"
                  style={dim}
                  numberOfLines={2}>
                  {b.description}
                </Text>
              ) : null}
              <View className="mt-1 flex-row flex-wrap items-center gap-1" style={dim}>
                {b.rating > 0 && (
                  <View className="mr-1">
                    <RatingStars value={b.rating} size="sm" />
                  </View>
                )}
                {/* Tapping an inline tag toggles the same filter the Tags sheet drives,
                    so a tag you can see is a tag you can filter by. */}
                {b.tags.map((bt) => (
                  <TagPill
                    key={bt.tag.id}
                    name={bt.tag.name}
                    color={bt.tag.color}
                    selected={selected.has(bt.tag.id)}
                    onPress={() => toggleTag(bt.tag.id)}
                  />
                ))}
              </View>
            </PhotoCard>
          );
        }}
      />

      <BottomSheetModal
        ref={sheetRef}
        backgroundStyle={{ backgroundColor: t.panel }}
        handleIndicatorStyle={{ backgroundColor: t.muted }}>
        <BottomSheetView style={{ paddingHorizontal: 16, paddingBottom: 32 }}>
          <Text className="mb-1 font-serif text-lg text-ink">Filter by tag</Text>
          {availableTags.map((tag) => {
            const on = selected.has(tag.id);
            return (
              <View
                key={tag.id}
                className="flex-row items-center border-b border-border">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${on ? 'Clear' : 'Filter by'} ${tag.name}`}
                  accessibilityState={{ selected: on }}
                  onPress={() => toggleTag(tag.id)}
                  className="flex-1 flex-row items-center justify-between py-3">
                  <Text className="font-sans text-ink">
                    #{tag.name.toLowerCase()}
                  </Text>
                  {on && <Text className="text-base text-primary">✓</Text>}
                </Pressable>
                {canWrite && (
                  // Collaborators can strip a tag off every bookmark in the list.
                  // Hidden outright on a locked list: it rewrites every bookmark
                  // it touches, which is exactly what the lock forbids.
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${tag.name} from this list`}
                    hitSlop={8}
                    onPress={() => confirmRemoveTag(tag.name)}
                    className="pl-4 py-3">
                    <Ionicons name="trash-outline" size={18} color={t.danger} />
                  </Pressable>
                )}
              </View>
            );
          })}
        </BottomSheetView>
      </BottomSheetModal>

      <BottomSheetModal
        ref={actionsSheetRef}
        backgroundStyle={{ backgroundColor: t.panel }}
        handleIndicatorStyle={{ backgroundColor: t.muted }}>
        <BottomSheetView style={{ paddingHorizontal: 16, paddingBottom: 32 }}>
          {canEdit && (
            // Kept visible but dead on a locked list, with a trailing "Locked"
            // label, so the reason is on screen instead of arriving as a server
            // error after the edit form has already been filled in.
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                listLocked
                  ? 'Edit list, unavailable while this list is locked'
                  : 'Edit list'
              }
              accessibilityState={{ disabled: listLocked }}
              disabled={listLocked}
              onPress={() => {
                actionsSheetRef.current?.dismiss();
                router.push({ pathname: '/lists/edit', params: { id } });
              }}
              className="flex-row items-center gap-3 border-b border-border py-3.5">
              <Ionicons
                name={listLocked ? 'lock-closed-outline' : 'create-outline'}
                size={20}
                color={listLocked ? t.muted : t.ink}
              />
              <Text className={listLocked ? 'font-sans text-muted' : 'font-sans text-ink'}>
                Edit list
              </Text>
              {listLocked && (
                <Text className="ml-auto font-sans text-xs" style={{ color: t.warning }}>
                  Locked
                </Text>
              )}
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Duplicate list"
            onPress={() => {
              actionsSheetRef.current?.dismiss();
              router.push({ pathname: '/lists/actions', params: { id, name } });
            }}
            className="flex-row items-center gap-3 border-b border-border py-3.5">
            <Ionicons name="copy-outline" size={20} color={t.ink} />
            <Text className="font-sans text-ink">Duplicate list</Text>
          </Pressable>
          {isOwner && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear list"
              onPress={() => {
                actionsSheetRef.current?.dismiss();
                confirmClear();
              }}
              className="flex-row items-center gap-3 py-3.5">
              <Ionicons name="trash-outline" size={20} color={t.danger} />
              <Text className="font-sans text-danger">Clear list</Text>
            </Pressable>
          )}
        </BottomSheetView>
      </BottomSheetModal>

      {isMember && id && (
        <ListChatSheet
          ref={chatSheetRef}
          listId={id}
          isOwner={isOwner}
          canSend={isMember}
          onRead={() => setChatUnread(0)}
        />
      )}
    </View>
  );
}
