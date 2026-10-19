import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireOnboardedUser } from "@/lib/session";
import { getUserLists } from "@/lib/lists";
import { getUserTags } from "@/lib/tags";
import { roleAtLeast } from "@/lib/permissions";
import { CreateBookmarkFlow } from "@/components/bookmarks/CreateBookmarkFlow";

/**
 * `?list=<id>` preselects that list (the desktop top bar's "+ Bookmark" and the
 * `c` shortcut pass the list being viewed). It is only honoured when the id is
 * one of the writable, unlocked lists offered below, so a stale, foreign,
 * viewer-only or locked id quietly preselects nothing.
 */
export default async function NewBookmarkPage({
  searchParams,
}: {
  searchParams: Promise<{ list?: string | string[] }>;
}) {
  const user = await requireOnboardedUser();
  const { list: rawList } = await searchParams;

  const [memberships, userTags] = await Promise.all([
    getUserLists(user.id),
    getUserTags(user.id),
  ]);
  const tagSuggestions = userTags.map((t) => t.name);
  const tagColors = Object.fromEntries(userTags.map((t) => [t.name, t.color]));

  // Only lists the user can add bookmarks to. Locked lists are left out for the
  // same reason a viewer's lists are: a lock means "cannot add to or modify"
  // (see LockedError in core/lists.ts), so offering one as a destination would
  // be offering a write that the list is not open to. They stay fully readable
  // from the home page, where they render in the locked state.
  const listOptions = memberships
    .filter((m) => roleAtLeast(m.role, "COLLABORATOR") && m.list.lockedAt === null)
    .map((m) => ({ id: m.listId, name: m.list.name, icon: m.list.icon }));
  const preselected =
    typeof rawList === "string" && listOptions.some((l) => l.id === rawList)
      ? [rawList]
      : [];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-12 lg:max-w-3xl lg:px-8 lg:py-8">
      <header className="flex flex-col gap-3">
        <Link
          href="/"
          className="text-muted hover:text-primary inline-flex w-fit items-center gap-1.5 text-sm lg:hidden"
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
        initialListIds={preselected}
        tagSuggestions={tagSuggestions}
        tagColors={tagColors}
      />
    </main>
  );
}
