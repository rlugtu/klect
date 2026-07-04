import Link from "next/link";
import { requireOnboardedUser } from "@/lib/session";
import { getUserLists } from "@/lib/lists";
import { getBookmarksByTags } from "@/lib/bookmarks";
import { getUserTagNames } from "@/lib/tags";
import type { ListCardData } from "@/lib/types";
import { CreateListPanel } from "@/components/lists/CreateListPanel";
import { HomeLists } from "@/components/lists/HomeLists";
import { SearchBar } from "@/components/search/SearchBar";
import { BookmarkCard } from "@/components/bookmarks/BookmarkCard";
import { PixelButton } from "@/components/ui/PixelButton";
import { Settings, MapPin } from "lucide-react";

function parseTags(raw: string | undefined): string[] {
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  ];
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ tags?: string }>;
}) {
  const user = await requireOnboardedUser();
  const selectedTags = parseTags((await searchParams).tags);

  const [memberships, tagOptions] = await Promise.all([
    getUserLists(user.id),
    getUserTagNames(user.id),
  ]);

  const lists: ListCardData[] = memberships.map((m) => ({
    id: m.listId,
    name: m.list.name,
    description: m.list.description,
    icon: m.list.icon,
    role: m.role,
    bookmarkCount: m.list._count.bookmarks,
    memberCount: m.list._count.memberships,
  }));

  const listOptions = lists.map((l) => ({
    id: l.id,
    name: l.name,
    icon: l.icon,
  }));

  const filtering = selectedTags.length > 0;
  const results = filtering
    ? await getBookmarksByTags(user.id, selectedTags)
    : [];

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12 flex flex-col gap-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="text-3xl shrink-0" aria-hidden>
            {user.icon ?? "🔖"}
          </span>
          <div className="min-w-0">
            <h1 className="text-xl text-primary font-bold">SAIVE</h1>
            <p className="text-muted text-sm truncate">
              Hi, {user.displayName ?? user.name}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/nearby">
            <PixelButton variant="secondary" size="sm">
              <MapPin size={14} aria-hidden /> Near me
            </PixelButton>
          </Link>
          <Link href="/settings">
            <PixelButton variant="secondary" size="sm">
              <Settings size={14} aria-hidden /> Settings
            </PixelButton>
          </Link>
          {/* <SignOutButton /> */}
        </div>
      </header>

      <SearchBar
        lists={listOptions}
        tags={tagOptions}
        selected={selectedTags}
      />

      {filtering ? (
        <section className="flex flex-col gap-4">
          <h2 className="font-pixel text-sm">
            {results.length} bookmark{results.length === 1 ? "" : "s"} tagged
          </h2>
          {results.length === 0 ? (
            <p className="text-muted">No bookmarks match these tags.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {results.map((b) => (
                <BookmarkCard
                  key={b.id}
                  listId={b.list.id}
                  listLabel={{ icon: b.list.icon, name: b.list.name }}
                  bookmark={{
                    id: b.id,
                    name: b.name,
                    description: b.description,
                    image: b.images[0] ?? null,
                    rating: b.rating,
                    visited: b.visited,
                    tags: b.tags.map((bt) => bt.tag),
                    commentCount: b._count.comments,
                  }}
                />
              ))}
            </div>
          )}
        </section>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CreateListPanel />
            <Link href="/bookmarks/new">
              <PixelButton>＋ New bookmark</PixelButton>
            </Link>
          </div>
          <section className="flex flex-col gap-4">
            <h2 className="font-pixel text-xl font-semibold text-primary">
              Your lists
            </h2>
            <HomeLists lists={lists} />
          </section>
        </>
      )}
    </main>
  );
}
