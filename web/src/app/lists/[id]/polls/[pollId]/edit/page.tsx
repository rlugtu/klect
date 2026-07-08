import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/session";
import { getPollForUser } from "@/lib/polls";
import { getBookmarksForList } from "@/lib/bookmarks";
import { updatePoll } from "@/lib/actions/polls";
import { PollForm } from "@/components/polls/PollForm";
import { PixelButton } from "@/components/ui/PixelButton";

export default async function EditPollPage({
  params,
}: {
  params: Promise<{ id: string; pollId: string }>;
}) {
  const { id, pollId } = await params;
  const user = await requireOnboardedUser();

  const poll = await getPollForUser(user.id, pollId);
  if (!poll || poll.listId !== id) notFound();

  const canManage = poll.role === "OWNER" || poll.creatorId === user.id;
  if (!canManage) notFound();

  const rows = await getBookmarksForList(id);
  const bookmarks = rows.map((b) => ({
    id: b.id,
    name: b.name,
    image: b.images[0] ?? null,
    tags: b.tags.map((bt) => bt.tag),
  }));

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12 flex flex-col gap-8">
      <div>
        <Link href={`/lists/${id}/polls/${pollId}`}>
          <PixelButton variant="ghost" size="sm">
            ← Poll
          </PixelButton>
        </Link>
      </div>

      <header>
        <h1 className="text-2xl text-primary">Edit poll</h1>
      </header>

      <PollForm
        action={updatePoll.bind(null, pollId)}
        bookmarks={bookmarks}
        submitLabel="Save changes"
        defaults={{
          name: poll.name,
          description: poll.description,
          startAt: poll.startAt,
          endAt: poll.endAt,
          maxVotes: poll.maxVotes,
          revotesAllowed: poll.revotesAllowed,
          bookmarkIds: poll.options.map((o) => o.bookmarkId),
        }}
      />
    </main>
  );
}
