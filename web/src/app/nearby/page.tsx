import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireOnboardedUser } from "@/lib/session";
import { getUserLists } from "@/lib/lists";
import { NearbyFinder } from "@/components/bookmarks/NearbyFinder";

export default async function NearbyPage() {
  const user = await requireOnboardedUser();
  const memberships = await getUserLists(user.id);

  const listOptions = memberships.map((m) => ({
    id: m.listId,
    name: m.list.name,
    icon: m.list.icon,
  }));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-3">
        <Link
          href="/"
          className="text-muted hover:text-primary inline-flex w-fit items-center gap-1.5 text-sm"
        >
          <ArrowLeft size={14} aria-hidden /> Back
        </Link>
        <div>
          <h1 className="text-primary text-xl font-bold">📍 Near me</h1>
          <p className="text-muted text-sm">
            Find bookmarks close to where you are right now.
          </p>
        </div>
      </header>

      <NearbyFinder listOptions={listOptions} />
    </main>
  );
}
