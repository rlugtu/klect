import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, UserRound } from "lucide-react";
import { requireOnboardedUser } from "@/lib/session";
import { getMessages } from "@/lib/dms";
import { atHandle } from "@/lib/handle";
import { DmThread } from "@/components/dms/DmThread";
import { PixelButton } from "@/components/ui/PixelButton";
import { UserIcon } from "@/components/ui/UserIcon";

export default async function DmThreadPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const user = await requireOnboardedUser();

  let page;
  try {
    page = await getMessages(user.id, conversationId);
  } catch {
    notFound();
  }
  if (!page.other) notFound();

  return (
    // At lg+ this fills the right pane of the messages workspace
    // (friends/layout.tsx): no Back (the inbox is the left pane), a divided
    // header with a profile link, and the thread edge to edge.
    <main className="mx-auto flex h-[100dvh] w-full max-w-3xl flex-col gap-4 px-6 py-6 lg:h-full lg:max-w-none lg:gap-0 lg:p-0">
      <header className="ws-thread-head flex items-center gap-3 lg:px-6 lg:py-3">
        <Link href="/friends/dms" className="lg:hidden">
          <PixelButton variant="secondary" size="sm">
            <ArrowLeft size={14} aria-hidden /> Back
          </PixelButton>
        </Link>
        <UserIcon icon={page.other.icon} className="text-lg lg:text-2xl" />
        <h1 className="text-primary truncate text-xl font-bold">
          {atHandle(page.other.handle)}
        </h1>
        <Link
          href={`/users/${page.other.handle ?? page.other.id}`}
          className="ml-auto hidden lg:block"
        >
          <PixelButton variant="secondary" size="sm" tabIndex={-1}>
            <UserRound size={14} aria-hidden /> View profile
          </PixelButton>
        </Link>
      </header>

      <DmThread
        key={conversationId}
        myId={user.id}
        conversationId={conversationId}
        initial={page}
      />
    </main>
  );
}
