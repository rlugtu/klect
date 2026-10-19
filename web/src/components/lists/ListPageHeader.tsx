import Link from "next/link";
import { Globe } from "lucide-react";
import { atHandle } from "@/lib/handle";
import { roleAtLeast } from "@/lib/permissions";
import type { getListForViewer } from "@/lib/lists";
import {
  updateList,
  deleteList,
  duplicateList,
  clearListBookmarks,
} from "@/lib/actions/lists";
import {
  ListToolbar,
  ListToolbarTriggers,
  ListToolbarPanels,
  type CreateBookmarkProps,
} from "@/components/lists/ListToolbar";
import { ListChatLauncher } from "@/components/lists/ListChatLauncher";
import { ListDesktopActions } from "@/components/lists/ListDesktopLayout";
import { ListTabs } from "@/components/lists/ListTabs";
import { ListVisibilityToggle } from "@/components/lists/ListVisibilityToggle";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelBadge } from "@/components/ui/PixelBadge";
import { LockedBadge } from "@/components/entitlements/LockedState";

type ListAccess = NonNullable<Awaited<ReturnType<typeof getListForViewer>>>;

/**
 * Shared header for the single-list views (List + Polls tabs). Renders the top
 * nav row, the list identity block, the owner/member toolbar (Members + ⋮
 * actions), and the route-based tab bar. Kept identical across tabs so the tabs
 * feel like two faces of one view.
 */
export function ListPageHeader({
  access,
  activeKey,
  createBookmark,
}: {
  access: ListAccess;
  activeKey: string;
  /** Collaborator+ on the List tab — enables the header "New bookmark" button. */
  createBookmark?: CreateBookmarkProps;
}) {
  const { list, role, isMember } = access;
  const id = list.id;
  const canEdit = isMember && roleAtLeast(role, "COLLABORATOR");
  const isOwner = isMember && role === "OWNER";
  // Read-only because the owner is over a free cap and left this list out of the
  // downgrade selection. `canEdit` is left alone and the lock is passed down
  // separately: the toolbar still needs to open for the actions a lock does not
  // take away (delete, visibility), it just must not offer the edit form.
  const locked = list.lockedAt !== null;
  const ownerName = atHandle(list.owner.handle);

  // Members-only group chatroom. Its state (first page, unread badge, realtime)
  // lives in the page's ListChatProvider so the drawer below lg and the desktop
  // panel's Chat tab share one subscription; the launcher just reads it.
  const chatLauncher = isMember ? <ListChatLauncher /> : null;

  const badges = (
    <>
      {locked && <LockedBadge />}
      {!isMember ? (
        <PixelBadge tone="accent" className="gap-1.5">
          <Globe size={12} aria-hidden /> Public · view only
        </PixelBadge>
      ) : (
        <>
          {list.isPublic && role !== "OWNER" && (
            <PixelBadge tone="default" className="gap-1.5">
              <Globe size={12} aria-hidden /> Public
            </PixelBadge>
          )}
          {role !== "OWNER" && (
            <PixelBadge tone="accent">
              {role === "COLLABORATOR" ? "Collaborator" : "Viewer"}
            </PixelBadge>
          )}
        </>
      )}
    </>
  );

  // At lg+ the header is compact: the Home link is redundant with the sidebar,
  // the role badges ride on the stats line, the List/Members/Polls pill bar is
  // replaced by the context panel's tabs, and Share + visibility sit beside the
  // title. Below lg every one of those renders exactly as before.
  const identity = (
    <>
      <div className="flex items-center justify-between gap-4 lg:hidden">
        {/* Redundant with the desktop sidebar's Home at lg+. */}
        <Link href="/" className="lg:hidden">
          <PixelButton variant="ghost" size="sm">
            ← Home
          </PixelButton>
        </Link>
        <div className="flex items-center gap-3">{badges}</div>
      </div>

      <header className="flex items-start gap-4">
        <span className="text-5xl lg:text-4xl" aria-hidden>
          {list.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-2xl text-primary break-words">{list.name}</h1>
            {isMember && (
              <div className="shrink-0">
                <ListToolbarTriggers
                  slot={
                    <>
                      {chatLauncher}
                      <ListDesktopActions
                        listId={id}
                        isOwner={isOwner}
                        isPublic={list.isPublic}
                      />
                    </>
                  }
                />
              </div>
            )}
          </div>
          {list.description && (
            <p className="text-muted mt-2">{list.description}</p>
          )}
          <p className="text-muted text-sm mt-2">
            {list._count.bookmarks} bookmark
            {list._count.bookmarks === 1 ? "" : "s"} · owned by{" "}
            <Link
              href={`/users/${list.owner.handle ?? list.owner.id}`}
              className="underline underline-offset-2 hover:text-primary"
            >
              {ownerName}
            </Link>
            {list._count.memberships > 1 &&
              ` · ${list._count.memberships} members`}
            <span className="ml-3 hidden items-center gap-2 align-middle lg:inline-flex">
              {badges}
            </span>
          </p>
        </div>
      </header>

      {isMember && <ListToolbarPanels />}

      <div className="flex lg:hidden">
        <ListTabs listId={id} activeKey={activeKey} isMember={isMember} />
      </div>
    </>
  );

  if (!isMember) return <div className="flex flex-col gap-6">{identity}</div>;

  return (
    <ListToolbar
      sourceName={list.name}
      canEdit={canEdit}
      locked={locked}
      canClear={isOwner}
      editAction={updateList.bind(null, id)}
      defaults={{
        name: list.name,
        description: list.description,
        icon: list.icon,
        isPublic: list.isPublic,
      }}
      deleteAction={isOwner ? deleteList.bind(null, id) : undefined}
      duplicateAction={duplicateList.bind(null, id)}
      clearAction={clearListBookmarks.bind(null, id)}
      visibilityChildren={
        isOwner ? (
          <ListVisibilityToggle listId={id} isPublic={list.isPublic} />
        ) : undefined
      }
      createBookmark={createBookmark}
    >
      <div className="flex flex-col gap-6">{identity}</div>
    </ListToolbar>
  );
}
