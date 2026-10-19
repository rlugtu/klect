import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireOnboardedUser } from "@/lib/session";
import { getFriends } from "@/lib/friends";
import { NewChatList } from "@/components/dms/NewChatList";
import { PixelButton } from "@/components/ui/PixelButton";

export default async function NewChatPage() {
  const user = await requireOnboardedUser();
  const friends = await getFriends(user.id);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12 lg:max-w-4xl lg:px-8 lg:py-8">
      <header className="flex items-center gap-3">
        <Link href="/friends/dms">
          <PixelButton variant="secondary" size="sm">
            <ArrowLeft size={14} aria-hidden /> Back
          </PixelButton>
        </Link>
        <h1 className="text-primary text-xl font-bold">New chat</h1>
      </header>

      <NewChatList friends={friends.map((f) => f.friend)} />
    </main>
  );
}
