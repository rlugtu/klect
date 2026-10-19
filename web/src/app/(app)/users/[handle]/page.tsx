import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/session";
import { getPublicProfile, getPublicListPreviewImages } from "@/lib/profile";
import { sendFriendRequestToUser } from "@/lib/actions/friends";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelBadge } from "@/components/ui/PixelBadge";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { ProfileModerationActions } from "@/components/moderation/ProfileModerationActions";
import { MessageFriendButton } from "@/components/dms/MessageFriendButton";
import { ListGridCard } from "@/components/lists/ListGridCard";
import type { FriendshipState } from "@/lib/profile";
import { ArrowLeft, Globe, Settings } from "lucide-react";
import { userIconOf } from "@/components/ui/UserIcon";

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const viewer = await requireOnboardedUser();

  const profile = await getPublicProfile(viewer.id, handle);
  if (!profile) notFound();

  const { user, publicLists, friendCount, friendship, blockedByMe } = profile;
  const name = user.handle ? `@${user.handle}` : "Someone";
  const memberSince = new Date(user.createdAt).getFullYear();
  // Photo strips for the lg+ list grid (public lists only, see the helper).
  const previews = await getPublicListPreviewImages(publicLists.map((l) => l.id));

  return (
    // lg+: an identity rail (sticky) beside a grid of the public lists. Below
    // lg the same markup stacks exactly as before; the desktop-only pieces are
    // display:none there.
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12 lg:grid lg:max-w-6xl lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start lg:px-8 lg:py-8 xl:grid-cols-[19rem_minmax(0,1fr)]">
      {/* At lg+ the sidebar has Home and the rail carries the Settings link. */}
      <header className="flex items-center justify-between gap-3 lg:hidden">
        {/* Redundant with the desktop sidebar's Home at lg+. */}
        <Link href="/" className="lg:hidden">
          <PixelButton variant="ghost" size="sm">
            <ArrowLeft size={14} aria-hidden /> Home
          </PixelButton>
        </Link>
        {friendship === "self" && (
          <Link href="/settings" aria-label="Settings" title="Settings">
            <PixelButton variant="secondary" size="sm">
              <Settings size={14} aria-hidden />
            </PixelButton>
          </Link>
        )}
      </header>

      {/* Identity (the rail at lg+) */}
      <section className="prof-rail flex flex-col items-center gap-3 text-center lg:sticky lg:top-[5.5rem]">
        <span
          className="pixel-box bg-panel flex size-24 items-center justify-center overflow-hidden text-5xl"
          aria-hidden
        >
          {userIconOf(user.icon)}
        </span>
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl text-primary break-words">{name}</h1>
          <p className="text-muted text-xs">Member since {memberSince}</p>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-8 pt-1">
          <Stat value={publicLists.length} label="Public lists" />
          <Stat value={friendCount} label="Friends" />
        </div>

        {friendship === "blocked" ? (
          <ProfileModerationActions
            targetUserId={user.id}
            handle={user.handle}
            blocked
          />
        ) : (
          <FriendAction targetUserId={user.id} state={friendship} />
        )}

        {friendship === "friends" && (
          <div className="hidden lg:block">
            <MessageFriendButton userId={user.id} handle={user.handle} />
          </div>
        )}

        {friendship === "self" && (
          <Link href="/settings" className="hidden lg:block">
            <PixelButton variant="secondary" size="sm" tabIndex={-1}>
              <Settings size={14} aria-hidden /> Settings
            </PixelButton>
          </Link>
        )}

        {friendship !== "self" && friendship !== "blocked" && (
          <ProfileModerationActions
            targetUserId={user.id}
            handle={user.handle}
            blocked={blockedByMe}
          />
        )}
      </section>

      {/* Public lists — hidden entirely when blocked */}
      {friendship !== "blocked" && (
      <section className="flex min-w-0 flex-col gap-4">
        <h2 className="font-pixel text-sm">Public lists</h2>
        {publicLists.length === 0 ? (
          <p className="text-muted text-sm">
            {friendship === "self"
              ? "You have no public lists yet — flip a list to public to show it here."
              : "No public lists yet."}
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:hidden">
              {publicLists.map((list) => (
                <Link
                  key={list.id}
                  href={`/lists/${list.id}`}
                  className="pixel-box bg-panel flex items-center gap-4 p-4 min-w-0"
                >
                  <span className="text-3xl shrink-0" aria-hidden>
                    {list.icon}
                  </span>
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="flex items-center gap-2">
                      <span className="font-pixel text-sm truncate">
                        {list.name}
                      </span>
                      <PixelBadge tone="default" className="shrink-0 gap-1 px-1.5 py-0">
                        <Globe size={11} aria-hidden />
                      </PixelBadge>
                    </span>
                    {list.description && (
                      <span className="text-muted text-sm truncate">
                        {list.description}
                      </span>
                    )}
                    <span className="text-muted text-sm">
                      {list._count.bookmarks} bookmark
                      {list._count.bookmarks === 1 ? "" : "s"}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
            {/* lg+: the same list cards as the desktop home. Every list here is
                the profile owner's own, hence role OWNER (which also means no
                Collab/Viewer badge). */}
            <div className="hidden gap-4 lg:grid lg:grid-cols-2 xl:grid-cols-3">
              {publicLists.map((list) => (
                <ListGridCard
                  key={list.id}
                  list={{
                    id: list.id,
                    name: list.name,
                    description: list.description,
                    icon: list.icon,
                    role: "OWNER",
                    bookmarkCount: list._count.bookmarks,
                    memberCount: list._count.memberships,
                    locked: list.lockedAt !== null,
                  }}
                  previews={previews[list.id] ?? []}
                />
              ))}
            </div>
          </>
        )}
      </section>
      )}
    </main>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-xl font-bold text-primary">{value}</span>
      <span className="text-muted text-xs">{label}</span>
    </div>
  );
}

function FriendAction({
  targetUserId,
  state,
}: {
  targetUserId: string;
  state: FriendshipState;
}) {
  if (state === "self" || state === "blocked") return null;
  if (state === "friends") {
    return <PixelBadge tone="success">✓ Friends</PixelBadge>;
  }
  if (state === "pending") {
    return <PixelBadge tone="accent">Request pending</PixelBadge>;
  }
  return (
    <form action={sendFriendRequestToUser.bind(null, targetUserId)}>
      <SubmitButton
        size="sm"
        label="Add friend"
        pendingLabel="Sending…"
      />
    </form>
  );
}
