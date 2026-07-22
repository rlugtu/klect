import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/session";
import { getPublicProfile } from "@/lib/profile";
import { sendFriendRequestToUser } from "@/lib/actions/friends";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelBadge } from "@/components/ui/PixelBadge";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { ProfileModerationActions } from "@/components/moderation/ProfileModerationActions";
import type { FriendshipState } from "@/lib/profile";
import { ArrowLeft, Globe, Settings } from "lucide-react";

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

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex items-center justify-between gap-3">
        <Link href="/">
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

      {/* Identity */}
      <section className="flex flex-col items-center gap-3 text-center">
        <span
          className="pixel-box bg-panel flex size-24 items-center justify-center overflow-hidden text-5xl"
          aria-hidden
        >
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.image}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            (user.icon ?? "🙂")
          )}
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
      <section className="flex flex-col gap-4">
        <h2 className="font-pixel text-sm">Public lists</h2>
        {publicLists.length === 0 ? (
          <p className="text-muted text-sm">
            {friendship === "self"
              ? "You have no public lists yet — flip a list to public to show it here."
              : "No public lists yet."}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
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
      <span className="text-muted text-xs uppercase">{label}</span>
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
