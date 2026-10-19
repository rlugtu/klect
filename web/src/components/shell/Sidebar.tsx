import Link from "next/link";
import { getShellData } from "@/lib/shell";
import { Skeleton } from "@/components/ui/Skeleton";
import { SidebarNav } from "./SidebarNav";
import { UserAvatar, type ShellUser } from "./UserAvatar";
import { SIDEBAR_ID, SidebarToggle } from "./SidebarSync";

const ASIDE =
  "shell-sidebar sticky top-0 z-30 hidden h-dvh w-16 shrink-0 flex-col lg:flex sbx:w-62";

/** Wordmark + "you" block. Identity comes from the session, so it never waits on data. */
function SidebarHead({ user }: { user: ShellUser }) {
  return (
    <>
      <Link
        href="/"
        title="Klect home"
        className="flex h-14 shrink-0 items-center justify-center gap-2.5 px-4 sbx:justify-start"
      >
        <span
          className="pixel-box-sm bg-primary text-primary-ink font-pixel flex size-8 items-center justify-center text-sm"
          aria-hidden
        >
          K
        </span>
        <span className="font-pixel text-primary sr-only text-lg font-bold sbx:not-sr-only">
          Klect
        </span>
      </Link>
      <Link
        href={`/users/${user.handle}`}
        title="Your profile"
        className="shell-item hover:bg-ink/5 mx-2 mb-2 flex items-center justify-center gap-2.5 px-2 py-2 sbx:mx-2.5 sbx:justify-start"
      >
        <UserAvatar user={user} />
        <span className="sr-only sbx:not-sr-only sbx:flex sbx:min-w-0 sbx:flex-col">
          <span className="truncate font-semibold">@{user.handle}</span>
          <span className="text-muted text-xs">View profile</span>
        </span>
      </Link>
    </>
  );
}

/** Server half of the desktop sidebar: reads the shell data, hands it to the nav. */
export async function Sidebar({
  user,
  email,
}: {
  user: ShellUser;
  email: string;
}) {
  const data = await getShellData(user.id, email);
  return (
    <aside id={SIDEBAR_ID} className={ASIDE} aria-label="Sidebar">
      <SidebarHead user={user} />
      <SidebarNav data={data} toggle={<SidebarToggle userId={user.id} />} />
    </aside>
  );
}

/** Same frame while the shell data streams in, so nothing jumps when it lands. */
export function SidebarSkeleton({ user }: { user: ShellUser }) {
  return (
    <aside id={SIDEBAR_ID} className={ASIDE} aria-label="Sidebar" aria-busy>
      <SidebarHead user={user} />
      <div className="flex flex-col gap-2 px-2 sbx:px-2.5">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    </aside>
  );
}
