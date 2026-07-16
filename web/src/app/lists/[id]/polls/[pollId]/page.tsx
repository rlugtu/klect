import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/session";
import { getPollForUser } from "@/lib/polls";
import { submitVotes, deletePoll } from "@/lib/actions/polls";
import { pollStatusLabel } from "@/lib/poll-status";
import { atHandle } from "@/lib/handle";
import { PollVote } from "@/components/polls/PollVote";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelBadge } from "@/components/ui/PixelBadge";
import { ConfirmDeleteButton } from "@/components/ui/ConfirmDeleteButton";

export default async function PollPage({
  params,
}: {
  params: Promise<{ id: string; pollId: string }>;
}) {
  const { id, pollId } = await params;
  const user = await requireOnboardedUser();

  const poll = await getPollForUser(user.id, pollId);
  if (!poll || poll.listId !== id) notFound();

  const canManage = poll.role === "OWNER" || poll.creatorId === user.id;
  const creator = atHandle(poll.creator.handle);

  const options = poll.options.map((o) => ({
    id: o.id,
    name: o.bookmark.name,
    image: o.bookmark.images[0] ?? null,
    votes: o.votes.map((v) => ({
      userId: v.userId,
      icon: v.user.icon,
      name: atHandle(v.user.handle),
    })),
  }));

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12 flex flex-col gap-8">
      <div className="flex items-center justify-between gap-4">
        <Link href={`/lists/${id}?tab=polls`}>
          <PixelButton variant="ghost" size="sm">
            ← Polls
          </PixelButton>
        </Link>
        <PixelBadge tone="accent" className="text-xs">
          {pollStatusLabel(poll.startAt, poll.endAt)}
        </PixelBadge>
      </div>

      <header className="flex flex-col gap-2">
        <h1 className="text-2xl text-primary break-words">{poll.name}</h1>
        {poll.description && <p className="text-muted">{poll.description}</p>}
        <p className="text-muted text-sm">
          {poll.creator.icon ? `${poll.creator.icon} ` : ""}
          {creator}
          {poll.endAt
            ? ` · ends ${new Date(poll.endAt).toLocaleString()}`
            : " · no end time"}
          {poll.isAnonymous ? " · 🔒 anonymous" : ""}
        </p>
      </header>

      <PollVote
        key={poll.myOptionIds.join(",")}
        submitAction={submitVotes.bind(null, pollId)}
        options={options}
        startAt={poll.startAt.toISOString()}
        endAt={poll.endAt ? poll.endAt.toISOString() : null}
        maxVotes={poll.maxVotes}
        revotesAllowed={poll.revotesAllowed}
        myOptionIds={poll.myOptionIds}
        isAnonymous={poll.isAnonymous}
      />

      {canManage && (
        <div className="flex items-center gap-3">
          <Link href={`/lists/${id}/polls/${pollId}/edit`}>
            <PixelButton variant="secondary" size="sm">
              Edit
            </PixelButton>
          </Link>
          <ConfirmDeleteButton
            action={deletePoll.bind(null, pollId)}
            label="Delete poll"
            confirmText="Delete this poll?"
          />
        </div>
      )}
    </main>
  );
}
