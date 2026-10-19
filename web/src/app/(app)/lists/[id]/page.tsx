import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/session";
import { getListForViewer } from "@/lib/lists";
import { getBookmarksForList } from "@/lib/bookmarks";
import { getBookmarkDetail } from "@/lib/bookmark-detail";
import { getListPolls } from "@/lib/polls";
import { getUserTags } from "@/lib/tags";
import { getCachedUserLists } from "@/lib/shell";
import { getListComments } from "@/lib/comments";
import { getChatMessages, getChatUnreadCount } from "@/lib/list-chat";
import { roleAtLeast } from "@/lib/permissions";
import { leaveList } from "@/lib/actions/sharing";
import { addListComment } from "@/lib/actions/comments";
import { CommentSection } from "@/components/comments/CommentSection";
import type { BookmarkCardData } from "@/lib/types";
import { ListPageHeader } from "@/components/lists/ListPageHeader";
import { ListChatProvider } from "@/components/lists/ListChatLauncher";
import {
  ListDesktopLayout,
  type PanelTab,
} from "@/components/lists/ListDesktopLayout";
import { MembersPanel } from "@/components/sharing/MembersPanel";
import type { CreateBookmarkProps } from "@/components/lists/ListToolbar";
import { createBookmark as createBookmarkAction } from "@/lib/actions/bookmarks";
import { removeListTag } from "@/lib/actions/tags";
import { PollsView } from "@/components/polls/PollsView";
import { ConfirmDeleteButton } from "@/components/ui/ConfirmDeleteButton";
import { ListBookmarks } from "@/components/bookmarks/ListBookmarks";
import { BookmarkPanelContent } from "@/components/bookmarks/BookmarkDetailView";
import { LockedNotice } from "@/components/entitlements/LockedState";
import { MobileOnly } from "@/components/ui/MobileOnly";

export default async function ListPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string | string[]; b?: string | string[] }>;
}) {
  const { id } = await params;
  const { tab, b } = await searchParams;
  const user = await requireOnboardedUser();

  const access = await getListForViewer(user.id, id);
  if (!access) notFound();

  const { role, isMember } = access;
  const canEdit = isMember && roleAtLeast(role, "COLLABORATOR");
  const isOwner = isMember && role === "OWNER";
  // A locked list is read-only for everyone, whatever their role: the owner's
  // account is over a free cap and chose not to keep this list active. Locked
  // means "cannot add to or modify" (see LockedError in core/lists.ts), so the
  // write affordances come off even though the role would allow them. Reads,
  // and the deletes that let an over-cap user trim back under the cap, stay.
  const listLocked = access.list.lockedAt !== null;
  const canWrite = canEdit && !listLocked;
  // Members + Polls tabs are members-only; a public viewer never sees them.
  // Below lg they replace the bookmark grid (as always); at lg+ the grid stays
  // and the tab opens in the right-hand context panel instead.
  const showPolls = tab === "polls" && isMember;
  const showMembers = tab === "members" && isMember;
  // `?b=<bookmarkId>`: the bookmark open in the desktop side panel.
  const openId = typeof b === "string" && b ? b : null;

  const [bookmarkRows, userTags, comments, polls, chat, detail, memberships] =
    await Promise.all([
      getBookmarksForList(id),
      getUserTags(user.id),
      getListComments(id, user.id),
      isMember ? getListPolls(id) : Promise.resolve(null),
      // Members-only group chatroom: first page + unread badge, server-side.
      isMember
        ? Promise.all([
            getChatMessages(user.id, id),
            getChatUnreadCount(user.id, id),
          ])
        : Promise.resolve(null),
      openId ? getBookmarkDetail(user.id, openId) : Promise.resolve(null),
      // Move-to-list destinations (same cached read the sidebar uses).
      canEdit ? getCachedUserLists(user.id) : Promise.resolve([]),
    ]);
  // Only a bookmark of this list opens here; anything else is ignored.
  const openDetail = detail && detail.bookmark.list.id === id ? detail : null;

  const tagSuggestions = userTags.map((t) => t.name);
  const tagColors = Object.fromEntries(userTags.map((t) => [t.name, t.color]));

  // Two ways a card here is read-only: the list is locked (so everything in it
  // is), or this individual bookmark was left out of the downgrade selection
  // inside an otherwise-active list, the case `getSelectionStatus` counts as
  // `lockedBookmarkCount`. The server refuses an edit identically either way.
  const bookmarks: BookmarkCardData[] = bookmarkRows.map((bm) => ({
    id: bm.id,
    name: bm.name,
    description: bm.description,
    image: bm.images[0] ?? null,
    images: bm.images.slice(0, 4),
    rating: bm.rating,
    visited: bm.visited,
    tags: bm.tags.map((bt) => bt.tag),
    commentCount: bm._count.comments,
    url: bm.urls[0] ?? null,
    locked: listLocked || bm.lockedAt !== null,
  }));

  // Lists a bookmark here can move into: ones the viewer can write to, unlocked.
  // The server re-checks all of it (core.moveBookmarks); this only shapes the menu.
  const moveDestinations = memberships
    .filter((m) => m.role !== "VIEWER" && m.list.lockedAt === null && m.listId !== id)
    .map((m) => ({ id: m.listId, name: m.list.name, icon: m.list.icon }));

  // Tags already used on bookmarks in this list (for quick-add chips).
  const listTags = [
    ...new Set(bookmarkRows.flatMap((bm) => bm.tags.map((bt) => bt.tag.name))),
  ].sort((x, y) => x.localeCompare(y));

  // When set (collaborator+ on the List tab), the header shows a "New bookmark" button.
  const createBookmark: CreateBookmarkProps | undefined =
    canWrite && !showMembers && !showPolls
      ? {
          action: createBookmarkAction.bind(null, id),
          tagSuggestions,
          listTags,
          tagColors,
        }
      : undefined;

  const listContent = (
    <>
      {listLocked && isMember && (
        <LockedNotice kind="list" canUpgrade={isOwner} />
      )}

      {isMember && role !== "OWNER" && (
        <ConfirmDeleteButton
          action={leaveList.bind(null, id)}
          label="Leave list"
          confirmText="Leave this list?"
        />
      )}

      <section className="flex flex-col gap-4">
        {bookmarks.length === 0 ? (
          <p className="text-muted text-sm text-center">
            {canWrite
              ? "No bookmarks yet. Add your first one. 🔖"
              : "No bookmarks here yet."}
          </p>
        ) : (
          <ListBookmarks
            listId={id}
            bookmarks={bookmarks}
            canManageTags={canWrite}
            removeTagAction={removeListTag.bind(null, id)}
            canEdit={canEdit}
            destinations={moveDestinations}
          />
        )}
      </section>
    </>
  );

  const commentProps = {
    comments,
    addAction: addListComment.bind(null, id),
    currentUserId: user.id,
    canModerate: isMember && role === "OWNER",
    readOnly: !isMember,
  };

  const pollsView = polls ? (
    <PollsView listId={id} polls={polls} canCreate={canWrite} />
  ) : null;
  const membersView = isMember ? (
    <MembersPanel listId={id} currentUserId={user.id} canManage={isOwner} />
  ) : null;

  // Below lg the page is exactly the old single column. The lg:hidden /
  // hidden lg:* pairs only decide which half shows at desktop width.
  // With `?tab=members|polls` the same view is also in the desktop panel, so
  // the mobile copy is `MobileOnly`: it unmounts once hydrated at lg+, leaving
  // one live instance, and MembersPanel reads through per-request cached
  // queries, so the two server renders share one database read.
  const content =
    showMembers || showPolls ? (
      <>
        <MobileOnly>
          <div>{showMembers ? membersView : pollsView}</div>
        </MobileOnly>
        <div className="hidden lg:flex lg:flex-col lg:gap-8">{listContent}</div>
      </>
    ) : (
      <>
        {listContent}
        <div className="lg:hidden">
          <CommentSection {...commentProps} />
        </div>
      </>
    );

  const tabs: PanelTab[] = isMember
    ? ["comments", "chat", "polls", "members"]
    : ["comments"];

  const page = (
    <ListDesktopLayout
      listId={id}
      viewerId={user.id}
      bookmarkId={openDetail ? openDetail.bookmark.id : null}
      urlTab={showMembers ? "members" : showPolls ? "polls" : undefined}
      tabs={tabs}
      comments={<CommentSection {...commentProps} plain />}
      polls={pollsView}
      members={membersView}
      bookmarkPanel={
        openDetail ? <BookmarkPanelContent detail={openDetail} /> : undefined
      }
    >
      <main className="mx-auto w-full max-w-3xl px-6 py-12 flex flex-col gap-8 lg:max-w-[1400px] lg:px-8 lg:py-8">
        <ListPageHeader
          access={access}
          activeKey={showMembers ? "members" : showPolls ? "polls" : "list"}
          createBookmark={createBookmark}
        />
        {content}
      </main>
    </ListDesktopLayout>
  );

  return chat ? (
    <ListChatProvider
      listId={id}
      myId={user.id}
      isOwner={isOwner}
      initial={chat[0]}
      initialUnread={chat[1]}
    >
      {page}
    </ListChatProvider>
  ) : page;
}
