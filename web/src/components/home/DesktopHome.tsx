import Link from "next/link";
import { Plus } from "lucide-react";
import type { ListCardData } from "@/lib/types";
import type { ListPreviewImage } from "@/lib/lists";
import type { VisibleBookmark } from "@/lib/bookmarks";
import { toBookmarkCardData } from "@/lib/bookmarks";
import type { getIncomingRequests } from "@/lib/sharing";
import { AttentionRequestActions } from "@/components/home/AttentionRequestActions";
import { ListGridCard } from "@/components/lists/ListGridCard";
import { HomeLists } from "@/components/lists/HomeLists";
import { CreateListPanel } from "@/components/lists/CreateListPanel";
import { BookmarkCard } from "@/components/bookmarks/BookmarkCard";
import { ReclaimBanner } from "@/components/entitlements/ReclaimBanner";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelCard } from "@/components/ui/PixelCard";
import { cn } from "@/lib/utils";

type IncomingRequest = Awaited<ReturnType<typeof getIncomingRequests>>[number];

export type DesktopHomeProps = {
  handle: string;
  lists: ListCardData[];
  previews: Record<string, ListPreviewImage[]>;
  recent: VisibleBookmark[];
  requests: IncomingRequest[];
  friendRequests: number;
  unreadMessages: number;
  /** Free user at the list cap: the "New list" tile says so instead of offering. */
  listCapReached: boolean;
  canReclaim: boolean;
  /** Arrived via the sidebar "+" (`/?newList=1`): open the create form. */
  newListOpen: boolean;
  /** `?lists=compact` shows the reorderable rows instead of the card grid. */
  listView: "grid" | "compact";
};

function SectionHead({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 id={id} className="font-pixel text-primary text-base font-semibold">
        {title}
      </h2>
      {children}
    </div>
  );
}

/** Grid / Compact switch. Links (not state) so the choice survives a reload. */
function ViewSwitch({ view }: { view: "grid" | "compact" }) {
  const options = [
    { key: "grid", label: "Grid", href: "/" },
    { key: "compact", label: "Compact", href: "/?lists=compact" },
  ] as const;
  return (
    <nav aria-label="List layout" className="pixel-box-sm bg-panel flex overflow-hidden">
      {options.map((o) => (
        <Link
          key={o.key}
          href={o.href}
          aria-current={view === o.key ? "true" : undefined}
          className={cn(
            "px-3 py-1 text-sm",
            view === o.key ? "bg-primary text-primary-ink" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  );
}

/** The dashed last tile in the list grid: create, or explain the cap. */
function NewListTile({ capReached }: { capReached: boolean }) {
  return (
    <Link
      href={capReached ? "/upgrade?reason=lists" : "/?newList=1#new-list"}
      className="border-border text-muted hover:text-ink flex min-h-36 flex-col items-center justify-center gap-1.5 border-2 border-dashed p-4 text-center"
    >
      <Plus size={22} aria-hidden />
      <span className="font-pixel text-sm">New list</span>
      {capReached && (
        <span className="text-xs">Free plan limit reached. Upgrade for more.</span>
      )}
    </Link>
  );
}

function AttentionColumn({
  requests,
  friendRequests,
  unreadMessages,
}: {
  requests: IncomingRequest[];
  friendRequests: number;
  unreadMessages: number;
}) {
  const nothing =
    requests.length === 0 && friendRequests === 0 && unreadMessages === 0;

  return (
    <aside aria-labelledby="attention-heading" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="attention-heading" className="font-pixel text-primary text-base font-semibold">
          Needs your attention
        </h2>
      </div>
      <PixelCard className="flex flex-col gap-4 p-4">
        {nothing && (
          <p className="text-muted text-sm">
            You&apos;re all caught up. List invites, friend requests, and unread
            messages show up here.
          </p>
        )}

        {requests.map((req) => (
          <div key={req.id} className="flex flex-col gap-2">
            <p className="text-sm">
              {req.invitedBy.handle ? (
                <>
                  <span className="font-semibold">@{req.invitedBy.handle}</span>{" "}
                  invited you to{" "}
                </>
              ) : (
                "You're invited to "
              )}
              <span className="font-semibold">
                {req.list.icon} {req.list.name}
              </span>
            </p>
            {/* Same server actions as /requests, plus a toast either way. */}
            <AttentionRequestActions inviteId={req.id} listName={req.list.name} />
          </div>
        ))}

        {(friendRequests > 0 || unreadMessages > 0) && (
          <div
            className={cn(
              "flex flex-col gap-2 text-sm",
              requests.length > 0 && "shell-divider pt-3",
            )}
          >
            {friendRequests > 0 && (
              <Link href="/friends/requests" className="flex items-center justify-between gap-2 hover:underline">
                <span>
                  {friendRequests} friend request{friendRequests === 1 ? "" : "s"}
                </span>
                <span className="bg-accent text-primary-ink min-w-5 rounded-full px-1.5 text-center text-xs leading-5 font-semibold">
                  {friendRequests}
                </span>
              </Link>
            )}
            {unreadMessages > 0 && (
              <Link href="/friends/dms" className="flex items-center justify-between gap-2 hover:underline">
                <span>
                  {unreadMessages} unread conversation{unreadMessages === 1 ? "" : "s"}
                </span>
                <span className="bg-accent text-primary-ink min-w-5 rounded-full px-1.5 text-center text-xs leading-5 font-semibold">
                  {unreadMessages}
                </span>
              </Link>
            )}
          </div>
        )}
      </PixelCard>
    </aside>
  );
}

/**
 * Home at lg+ (the mobile home renders below lg, untouched): a launchpad of list
 * cards with photo strips, a cross-list Recently saved row, and at xl a "Needs
 * your attention" column built only from data that already exists (list
 * invites, friend requests, unread messages).
 */
export function DesktopHome({
  handle,
  lists,
  previews,
  recent,
  requests,
  friendRequests,
  unreadMessages,
  listCapReached,
  canReclaim,
  newListOpen,
  listView,
  className,
}: DesktopHomeProps & { className?: string }) {
  const bookmarkTotal = lists.reduce((n, l) => n + l.bookmarkCount, 0);
  const summary = [
    `${lists.length} list${lists.length === 1 ? "" : "s"}`,
    `${bookmarkTotal} bookmark${bookmarkTotal === 1 ? "" : "s"}`,
    requests.length > 0 &&
      `${requests.length} request${requests.length === 1 ? "" : "s"} waiting`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[1400px] flex-col gap-8 px-8 py-8",
        className,
      )}
    >
      <header className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-primary truncate text-2xl font-bold">Hi, @{handle}</h1>
          <p className="text-muted mt-1 text-sm">{summary}</p>
        </div>
        {!newListOpen && (
          <Link href="/?newList=1#new-list">
            <PixelButton variant="secondary" size="sm">
              <Plus size={14} aria-hidden /> New list
            </PixelButton>
          </Link>
        )}
      </header>

      {canReclaim && <ReclaimBanner />}

      {newListOpen && (
        <div id="new-list" className="max-w-2xl scroll-mt-20">
          <CreateListPanel defaultOpen />
        </div>
      )}

      <section aria-labelledby="your-lists" className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id="your-lists" className="font-pixel text-primary text-base font-semibold">
            Your lists
          </h2>
          {lists.length > 0 && <ViewSwitch view={listView} />}
        </div>
        {listView === "compact" ? (
          <div className="max-w-3xl">
            <HomeLists lists={lists} />
          </div>
        ) : (
          <div className="dens-grid grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4">
            {lists.map((list) => (
              <ListGridCard key={list.id} list={list} previews={previews[list.id] ?? []} />
            ))}
            <NewListTile capReached={listCapReached} />
          </div>
        )}
      </section>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section aria-labelledby="recently-saved" className="flex min-w-0 flex-col gap-4">
          <SectionHead id="recently-saved" title="Recently saved">
            <Link href="/bookmarks" className="text-primary text-sm font-semibold hover:underline">
              All bookmarks
            </Link>
          </SectionHead>
          {recent.length === 0 ? (
            <p className="text-muted text-sm">
              Nothing saved yet. Bookmarks you add to any list show up here.
            </p>
          ) : (
            <div className="dens-grid grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
              {recent.map((b) => (
                <BookmarkCard
                  key={b.id}
                  listId={b.list.id}
                  listLabel={{ icon: b.list.icon, name: b.list.name }}
                  bookmark={toBookmarkCardData(b)}
                />
              ))}
            </div>
          )}
        </section>

        <div className="hidden xl:block">
          <AttentionColumn
            requests={requests}
            friendRequests={friendRequests}
            unreadMessages={unreadMessages}
          />
        </div>
      </div>
    </div>
  );
}
