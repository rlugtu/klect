import Link from "next/link";
import { requireOnboardedUser } from "@/lib/session";
import { FeedbackForm } from "@/components/settings/FeedbackForm";
import { PixelCard } from "@/components/ui/PixelCard";
import { PixelButton } from "@/components/ui/PixelButton";

export default async function FeedbackPage() {
  await requireOnboardedUser();

  return (
    <main className="mx-auto w-full max-w-lg px-6 py-12 flex flex-col gap-8">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl text-primary">Send feedback</h1>
        <Link href="/settings">
          <PixelButton variant="ghost" size="sm">
            ← Settings
          </PixelButton>
        </Link>
      </header>

      <PixelCard>
        <p className="text-muted mb-5 text-sm">
          Found a bug or have an idea? Tell us — every note helps make Klect
          better.
        </p>
        <FeedbackForm />
      </PixelCard>
    </main>
  );
}
