import Link from "next/link";
import { requireOnboardedUser } from "@/lib/session";
import { getOutgoingFriendRequests } from "@/lib/friends";
import { cancelFriendRequest } from "@/lib/actions/friends";
import { atHandle } from "@/lib/handle";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelCard } from "@/components/ui/PixelCard";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { ArrowLeft } from "lucide-react";

/** Friend requests the user has sent, awaiting acceptance. Withdraw with Cancel. */
export default async function PendingFriendRequestsPage() {
  const user = await requireOnboardedUser();
  const requests = await getOutgoingFriendRequests(user.id);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex items-center gap-3">
        <Link href="/friends">
          <PixelButton variant="secondary" size="sm">
            <ArrowLeft size={14} aria-hidden /> Friends
          </PixelButton>
        </Link>
        <h1 className="text-primary text-xl font-bold">
          Pending requests {requests.length > 0 && `(${requests.length})`}
        </h1>
      </header>

      {requests.length === 0 ? (
        <p className="text-muted">
          No pending requests. Requests you send appear here until they&apos;re
          accepted.
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
                  {r.addressee.icon ?? "🔖"}
                </span>
                <span className="truncate text-sm font-semibold">
                  {atHandle(r.addressee.handle)}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <form action={cancelFriendRequest.bind(null, r.id)}>
                  <SubmitButton
                    label="Withdraw"
                    pendingLabel="…"
                    variant="secondary"
                    size="sm"
                  />
                </form>
              </span>
            </PixelCard>
          ))}
        </div>
      )}
    </main>
  );
}
