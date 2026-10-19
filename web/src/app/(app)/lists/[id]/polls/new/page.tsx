import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/session";
import { getListForUser } from "@/lib/lists";
import { getBookmarksForList } from "@/lib/bookmarks";
import { roleAtLeast } from "@/lib/permissions";
import { createPoll } from "@/lib/actions/polls";
import { PollForm } from "@/components/polls/PollForm";
import { PixelButton } from "@/components/ui/PixelButton";
import { Plus } from "lucide-react";

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
        <Link href={`/lists/${id}?tab=polls`}>
          <PixelButton variant="ghost" size="sm">
            ← Polls
          </PixelButton>
        </Link>
      </div>

      <header>
        <h1 className="text-2xl text-primary">New poll</h1>
      </header>

      {bookmarks.length < 2 ? (
        <div className="flex flex-col items-center gap-3">
          <p className="text-muted text-sm text-center">
            You need at least two bookmarks in this list to start a poll.
          </p>
          <Link href={`/lists/${id}`}>
            <PixelButton variant="secondary" size="sm">
              <Plus size={14} aria-hidden /> Add a bookmark
            </PixelButton>
          </Link>
        </div>
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
