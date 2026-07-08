import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/session";
import { getListForUser } from "@/lib/lists";
import { getListPolls } from "@/lib/polls";
import { roleAtLeast } from "@/lib/permissions";
import { pollStatusLabel } from "@/lib/poll-status";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelBadge } from "@/components/ui/PixelBadge";

export default async function PollsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireOnboardedUser();

  const membership = await getListForUser(user.id, id);
  if (!membership) notFound();

  const { list, role } = membership;
  const canCreate = roleAtLeast(role, "COLLABORATOR");
  const polls = await getListPolls(id);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12 flex flex-col gap-8">
      <div className="flex items-center justify-between gap-4">
        <Link href={`/lists/${id}`}>
          <PixelButton variant="ghost" size="sm">
            ← {list.icon} {list.name}
          </PixelButton>
        </Link>
        {canCreate && (
          <Link href={`/lists/${id}/polls/new`}>
            <PixelButton size="sm">＋ New poll</PixelButton>
          </Link>
        )}
      </div>

      <header>
        <h1 className="text-2xl text-primary">🗳 Polls</h1>
        <p className="text-muted text-sm mt-2">
          Vote on the bookmarks in this list.
        </p>
      </header>

      {polls.length === 0 ? (
        <p className="text-muted text-sm text-center">
          {canCreate
            ? "No polls yet — create the first one. 🗳"
            : "No polls here yet."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {polls.map((poll) => {
            const creator =
              poll.creator.displayName ?? poll.creator.name ?? "Someone";
            return (
              <li key={poll.id}>
                <Link
                  href={`/lists/${id}/polls/${poll.id}`}
                  className="pixel-box bg-panel flex flex-col gap-2 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-pixel text-sm min-w-0 flex-1 break-words">
                      {poll.name}
                    </span>
                    <PixelBadge tone="accent" className="shrink-0 text-xs">
                      {pollStatusLabel(poll.startAt, poll.endAt)}
                    </PixelBadge>
                  </div>
                  {poll.description && (
                    <p className="text-muted text-sm truncate">
                      {poll.description}
                    </p>
                  )}
                  <span className="text-muted text-sm">
                    {poll.creator.icon ? `${poll.creator.icon} ` : ""}
                    {creator} · {poll._count.options} option
                    {poll._count.options === 1 ? "" : "s"} · {poll._count.votes}{" "}
                    vote{poll._count.votes === 1 ? "" : "s"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
