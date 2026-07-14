import Link from "next/link";
import { requireOnboardedUser } from "@/lib/session";
import { getIncomingRequests } from "@/lib/sharing";
import { approveRequest, rejectRequest } from "@/lib/actions/sharing";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelCard } from "@/components/ui/PixelCard";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { ArrowLeft } from "lucide-react";

/**
 * All open list-join (collab) requests addressed to the current user. Reached from
 * the home page button; approving/rejecting revalidates so the row drops off.
 */
export default async function RequestsPage() {
  const user = await requireOnboardedUser();
  const requests = await getIncomingRequests(user.email);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex items-center gap-3">
        <Link href="/">
          <PixelButton variant="secondary" size="sm">
            <ArrowLeft size={14} aria-hidden /> Back
          </PixelButton>
        </Link>
        <h1 className="text-primary text-xl font-bold">
          List requests {requests.length > 0 && `(${requests.length})`}
        </h1>
      </header>

      {requests.length === 0 ? (
        <p className="text-muted">
          No open list requests. When someone invites you to a list, it shows up
          here to approve or reject.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {requests.map((req) => (
            <PixelCard
              key={req.id}
              className="flex items-center justify-between gap-3"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden className="shrink-0 text-lg">
                  {req.list.icon}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold">
                    {req.list.name}
                  </span>
                  <span className="text-muted truncate text-sm">
                    {req.list.description || "No description"}
                  </span>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <form action={rejectRequest.bind(null, req.id)}>
                  <SubmitButton
                    label="Reject"
                    pendingLabel="…"
                    variant="secondary"
                    size="sm"
                  />
                </form>
                <form action={approveRequest.bind(null, req.id)}>
                  <SubmitButton label="Approve" pendingLabel="…" size="sm" />
                </form>
              </span>
            </PixelCard>
          ))}
        </div>
      )}
    </main>
  );
}
