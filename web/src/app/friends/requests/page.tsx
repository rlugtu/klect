import Link from "next/link";
import { requireOnboardedUser } from "@/lib/session";
import { getIncomingFriendRequests } from "@/lib/friends";
import {
  acceptFriendRequest,
  declineFriendRequest,
} from "@/lib/actions/friends";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelCard } from "@/components/ui/PixelCard";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { ArrowLeft } from "lucide-react";

/** All incoming friend requests: accept or decline. Linked from the Friends page. */
export default async function FriendRequestsPage() {
  const user = await requireOnboardedUser();
  const requests = await getIncomingFriendRequests(user.id);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex items-center gap-3">
        <Link href="/friends">
          <PixelButton variant="secondary" size="sm">
            <ArrowLeft size={14} aria-hidden /> Friends
          </PixelButton>
        </Link>
        <h1 className="text-primary text-xl font-bold">
          Friend requests {requests.length > 0 && `(${requests.length})`}
        </h1>
      </header>

      {requests.length === 0 ? (
        <p className="text-muted">
          No pending friend requests. When someone adds you, it shows up here to
          accept or decline.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {requests.map((r) => (
            <PixelCard
              key={r.id}
              className="flex items-center justify-between gap-3"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden className="text-lg">
                  {r.requester.icon ?? "🔖"}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold">
                    {r.requester.displayName ??
                      r.requester.name ??
                      r.requester.email}
                  </span>
                  <span className="text-muted truncate text-sm">
                    {r.requester.email}
                  </span>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <form action={declineFriendRequest.bind(null, r.id)}>
                  <SubmitButton
                    label="Decline"
                    pendingLabel="…"
                    variant="secondary"
                    size="sm"
                  />
                </form>
                <form action={acceptFriendRequest.bind(null, r.id)}>
                  <SubmitButton label="Accept" pendingLabel="…" size="sm" />
                </form>
              </span>
            </PixelCard>
          ))}
        </div>
      )}
    </main>
  );
}
