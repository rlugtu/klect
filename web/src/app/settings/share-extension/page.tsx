import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { requireOnboardedUser } from "@/lib/session";
import { PixelCard } from "@/components/ui/PixelCard";
import { PixelButton } from "@/components/ui/PixelButton";

export const metadata: Metadata = {
  title: "Share to Klect",
};

/**
 * Static, illustrated walkthrough for adding the Klect iOS share extension to the system Share
 * sheet. Reachable from /settings. Screenshots are the same PNGs shipped in the mobile help screen,
 * served from /public/share-help.
 */
const STEPS = [
  {
    title: "Open the Share menu",
    body: "In any app, tap Share. In Safari you can also press and hold a link, then tap Share.",
    image: "/share-help/step-1.png",
    width: 1206,
    height: 2622,
  },
  {
    title: "Tap “More”",
    body: "In the share sheet, swipe the row of app icons to the end and tap More.",
    image: "/share-help/step-2.png",
    width: 1206,
    height: 2622,
  },
  {
    title: "Turn on Klect",
    body: "Tap Edit, add Klect to your Favorites, then tap the checkmark.",
    image: "/share-help/step-3.png",
    width: 1206,
    height: 1113,
  },
  {
    title: "Save to Klect",
    body: "Klect now shows in your share sheet — tap it, pick your lists, and save.",
    image: "/share-help/step-4.png",
    width: 1206,
    height: 2622,
  },
];

export default async function ShareExtensionHelpPage() {
  await requireOnboardedUser();

  return (
    <main className="mx-auto w-full max-w-lg px-6 py-12 flex flex-col gap-8">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl text-primary">Share to Klect</h1>
        <Link href="/settings">
          <PixelButton variant="ghost" size="sm">
            ← Settings
          </PixelButton>
        </Link>
      </header>

      <p className="text-muted">
        Save links to Klect from any app on your iPhone — no copy-pasting. Here’s how to add Klect to
        your iOS Share sheet.
      </p>

      <ol className="flex flex-col gap-8">
        {STEPS.map((step, i) => (
          <li key={i}>
            <PixelCard className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-ink">
                  {i + 1}
                </span>
                <h2 className="text-base text-ink">{step.title}</h2>
              </div>
              <p className="text-muted text-sm">{step.body}</p>
              <Image
                src={step.image}
                alt={`Step ${i + 1}: ${step.title}`}
                width={step.width}
                height={step.height}
                className={`rounded border-border border h-auto ${
                  step.height > step.width ? "mx-auto w-2/3" : "w-full"
                }`}
              />
            </PixelCard>
          </li>
        ))}
      </ol>
    </main>
  );
}
