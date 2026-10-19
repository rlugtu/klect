import { Suspense } from "react";
import { Bell } from "lucide-react";
import { getShellData } from "@/lib/shell";
import { AttentionMenu } from "./AttentionMenu";
import { GlobalSearch } from "./GlobalSearch";
import { NewBookmarkButton } from "./NewBookmarkButton";
import type { ShellUser } from "./UserAvatar";

async function TopBarAttention({ userId, email }: { userId: string; email: string }) {
  // Same cached read as the sidebar, so this costs nothing extra.
  const data = await getShellData(userId, email);
  return (
    <AttentionMenu
      listRequests={data.listRequests}
      friendRequests={data.friendRequests}
      unreadMessages={data.unreadMessages}
    />
  );
}

function BellPlaceholder() {
  return (
    <span
      className="pixel-box-sm bg-panel text-muted flex size-9 items-center justify-center"
      aria-hidden
    >
      <Bell size={16} />
    </span>
  );
}

/**
 * Sticky desktop top bar (lg+): search (the command palette trigger), the
 * always-visible add button (preselects the current list on a list page),
 * bell. No profile button here: the sidebar's profile row is the one way in.
 */
export function TopBar({ user, email }: { user: ShellUser; email: string }) {
  return (
    <header className="shell-topbar sticky top-0 z-30 hidden h-14 shrink-0 items-center gap-3 px-6 lg:flex">
      <Suspense fallback={<div className="h-9 w-full max-w-xl" />}>
        <GlobalSearch />
      </Suspense>
      <span className="flex-1" />
      <NewBookmarkButton />
      <Suspense fallback={<BellPlaceholder />}>
        <TopBarAttention userId={user.id} email={email} />
      </Suspense>
    </header>
  );
}
