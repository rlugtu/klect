import Link from "next/link";
import { atHandle } from "@/lib/handle";
import { pollStatusLabel } from "@/lib/poll-status";
import type { getListPolls } from "@/lib/polls";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelBadge } from "@/components/ui/PixelBadge";

type Polls = Awaited<ReturnType<typeof getListPolls>>;

/**
 * The Polls face of the single-list view. Rendered inline on `/lists/[id]`
 * (via `?tab=polls`) so the header, list details, and tab bar stay put; poll
 * detail/create/edit remain their own routes.
 */
export function PollsView({
  listId,
  polls,
  canCreate,
}: {
  listId: string;
  polls: Polls;
  canCreate: boolean;
}) {
  return (
    <section className="flex flex-col gap-4">
      {canCreate && (
        <div className="flex justify-end">
          <Link href={`/lists/${listId}/polls/new`}>
            <PixelButton size="sm">＋ New poll</PixelButton>
          </Link>
        </div>
      )}

      {polls.length === 0 ? (
        <p className="text-muted text-sm text-center">
          {canCreate
            ? "No polls yet — create the first one. 🗳"
            : "No polls here yet."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {polls.map((poll) => {
            const creator = atHandle(poll.creator.handle);
            return (
              <li key={poll.id}>
                <Link
                  href={`/lists/${listId}/polls/${poll.id}`}
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
    </section>
  );
}
