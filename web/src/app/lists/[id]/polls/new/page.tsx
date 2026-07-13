import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/session";
import { getListForUser } from "@/lib/lists";
import { getBookmarksForList } from "@/lib/bookmarks";
import { roleAtLeast } from "@/lib/permissions";
import { createPoll } from "@/lib/actions/polls";
import { PollForm } from "@/components/polls/PollForm";
import { PixelButton } from "@/components/ui/PixelButton";

export default async function NewPollPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireOnboardedUser();

  const membership = await getListForUser(user.id, id);
  if (!membership || !roleAtLeast(membership.role, "COLLABORATOR")) notFound();

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
        <Link href={`/lists/${id}/polls`}>
          <PixelButton variant="ghost" size="sm">
            ← Polls
          </PixelButton>
        </Link>
      </div>

      <header>
        <h1 className="text-2xl text-primary">New poll</h1>
      </header>

      {bookmarks.length < 2 ? (
        <p className="text-muted text-sm text-center">
          You need at least two bookmarks in this list to start a poll.
        </p>
      ) : (
        <PollForm
          action={createPoll.bind(null, id)}
          bookmarks={bookmarks}
          submitLabel="Create poll"
          showAnonymous
        />
      )}
    </main>
  );
}
