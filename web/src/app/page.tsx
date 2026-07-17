import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { LandingPage } from "@/components/marketing/LandingPage";
import { getUserLists } from "@/lib/lists";
import { getBookmarksByTags } from "@/lib/bookmarks";
import { getIncomingRequests } from "@/lib/sharing";
import { getUserTags } from "@/lib/tags";
import type { ListCardData } from "@/lib/types";
import { CreateListPanel } from "@/components/lists/CreateListPanel";
import { HomeLists } from "@/components/lists/HomeLists";
import { SearchBar } from "@/components/search/SearchBar";
import { BookmarkCard } from "@/components/bookmarks/BookmarkCard";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelBadge } from "@/components/ui/PixelBadge";
import { Plus, MapPin, Users, User, Inbox } from "lucide-react";

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
  // Logged-out visitors get the public marketing landing page; everyone else
  // sees their app home. (Onboarding is still enforced for signed-in users.)
  const session = await getSession();
  if (!session) return <LandingPage />;
  if (!session.user.handle) redirect("/onboarding");
  const user = session.user;

  const selectedTags = parseTags((await searchParams).tags);

  const [memberships, userTags, incomingRequests] = await Promise.all([
    getUserLists(user.id),
    getUserTags(user.id),
    getIncomingRequests(user.email),
  ]);
  const tagOptions = userTags.map((t) => t.name);
  const tagColors = Object.fromEntries(userTags.map((t) => [t.name, t.color]));

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
            <h1 className="text-xl text-primary font-bold">KLECT</h1>
            <p className="text-muted text-sm truncate">
              Hi, @{user.handle}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/bookmarks/new">
            <PixelButton variant="secondary" size="sm">
              <Plus size={14} aria-hidden /> Bookmark
            </PixelButton>
          </Link>
          <Link href="/nearby">
            <PixelButton variant="secondary" size="sm">
              <MapPin size={14} aria-hidden /> Near me
            </PixelButton>
          </Link>
          <Link href="/friends">
            <PixelButton variant="secondary" size="sm">
              <Users size={14} aria-hidden /> Friends
            </PixelButton>
          </Link>
          <Link href={`/users/${user.handle ?? user.id}`}>
            <PixelButton variant="secondary" size="sm">
              <User size={14} aria-hidden /> Profile
            </PixelButton>
          </Link>
          {/* <SignOutButton /> */}
        </div>
      </header>

      <div className="flex justify-start">
        <Link href="/requests">
          <PixelButton variant="secondary" size="sm">
            <Inbox size={14} aria-hidden /> List requests
            {incomingRequests.length > 0 && (
              <PixelBadge tone="accent" className="ml-1 px-1.5 py-0">
                {incomingRequests.length}
              </PixelBadge>
            )}
          </PixelButton>
        </Link>
      </div>

      <SearchBar
        lists={listOptions}
        tags={tagOptions}
        selected={selectedTags}
        tagColors={tagColors}
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
          <CreateListPanel />
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
