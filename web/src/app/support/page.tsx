import type { Metadata } from "next";
import Link from "next/link";
import { PixelCard } from "@/components/ui/PixelCard";
import { PixelButton } from "@/components/ui/PixelButton";

export const metadata: Metadata = {
  title: "Support",
  description: "Get help with Klect: contact us, manage your subscription, or delete your account.",
};

/**
 * Public support page, reachable without signing in (this route intentionally does NOT call
 * requireOnboardedUser, like /privacy and /terms) so it can serve as the App Store Connect
 * "Support URL". Keep the contact email in sync with the privacy policy.
 */
const CONTACT_EMAIL = "klectapp@gmail.com";

export default function SupportPage() {
  return (
    <main className="mx-auto w-full max-w-lg px-6 py-12 flex flex-col gap-8">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl text-primary">Support</h1>
        <Link href="/">
          <PixelButton variant="ghost" size="sm">
            ← Home
          </PixelButton>
        </Link>
      </header>

      <p className="text-muted">
        Need help with Klect? Email us and we will get back to you as soon as we can.
      </p>

      <PixelCard className="flex flex-col gap-3">
        <h2 className="text-base text-ink">Contact us</h2>
        <p className="text-muted text-sm">
          Email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline">
            {CONTACT_EMAIL}
          </a>{" "}
          with your @handle and a short description of the problem. Screenshots help.
        </p>
      </PixelCard>

      <PixelCard className="flex flex-col gap-3">
        <h2 className="text-base text-ink">Manage or cancel Klect Pro</h2>
        <p className="text-muted text-sm">
          If you subscribed in the iPhone app, open the Settings app on your iPhone, tap your name,
          then Subscriptions, and choose Klect Pro. If you subscribed on the web, use the link in
          your receipt email. To get Pro back on a new phone, open the Klect Pro screen in the app
          and tap Restore purchases.
        </p>
      </PixelCard>

      <PixelCard className="flex flex-col gap-3">
        <h2 className="text-base text-ink">Delete your account</h2>
        <p className="text-muted text-sm">
          Open Settings in the app and choose Delete account. This permanently removes your account
          and your data. See the{" "}
          <Link href="/privacy" className="text-primary underline">
            Privacy Policy
          </Link>{" "}
          for details.
        </p>
      </PixelCard>

      <PixelCard className="flex flex-col gap-3">
        <h2 className="text-base text-ink">Report a user or content</h2>
        <p className="text-muted text-sm">
          In the app, open a profile, comment, or message and choose Report. You can also block a
          user from their profile. You can also email us the details. See our{" "}
          <Link href="/terms" className="text-primary underline">
            Terms of Use
          </Link>{" "}
          for what is not allowed.
        </p>
      </PixelCard>
    </main>
  );
}
