import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireOnboardedUser } from "@/lib/session";
import { getUserLists } from "@/lib/lists";
import { getUserTags } from "@/lib/tags";
import { roleAtLeast } from "@/lib/permissions";
import { CreateBookmarkFlow } from "@/components/bookmarks/CreateBookmarkFlow";

export default async function NewBookmarkPage() {
  const user = await requireOnboardedUser();

  const [memberships, userTags] = await Promise.all([
    getUserLists(user.id),
    getUserTags(user.id),
  ]);
  const tagSuggestions = userTags.map((t) => t.name);
  const tagColors = Object.fromEntries(userTags.map((t) => [t.name, t.color]));

  // Only lists the user can add bookmarks to.
  const listOptions = memberships
    .filter((m) => roleAtLeast(m.role, "COLLABORATOR"))
    .map((m) => ({ id: m.listId, name: m.list.name, icon: m.list.icon }));

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-3">
        <Link
          href="/"
          className="text-muted hover:text-primary inline-flex w-fit items-center gap-1.5 text-sm"
        >
          <ArrowLeft size={14} aria-hidden /> Back
        </Link>
        <div>
          <h1 className="text-primary text-xl font-bold">New bookmark</h1>
          <p className="text-muted text-sm">
            Add a bookmark to one or more lists at once.
          </p>
        </div>
      </header>

      <CreateBookmarkFlow
        listOptions={listOptions}
        tagSuggestions={tagSuggestions}
        tagColors={tagColors}
      />
    </main>
  );
}
