import type { Metadata } from "next";
import Link from "next/link";
import { PixelCard } from "@/components/ui/PixelCard";
import { PixelButton } from "@/components/ui/PixelButton";

export const metadata: Metadata = {
  title: "Terms of Use",
  description:
    "The agreement for using Klect, including our zero-tolerance policy for objectionable content and abusive users.",
};

/**
 * Public Terms of Use / EULA — reachable without signing in (no requireOnboardedUser) so it can
 * serve as the App Store "License Agreement" URL and satisfy Apple Guideline 1.2's requirement
 * that apps with user-generated content publish an agreement with a zero-tolerance policy for
 * objectionable content and abusive users. Linked from Settings + the sign-in screen on both apps.
 */
const LAST_UPDATED = "July 22, 2026";
const CONTACT_EMAIL = "ryanlugtu@gmail.com";

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-lg px-6 py-12 flex flex-col gap-8">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl text-primary">Terms of Use</h1>
        <Link href="/">
          <PixelButton variant="ghost" size="sm">
            ← Home
          </PixelButton>
        </Link>
      </header>

      <p className="text-muted text-sm">Last updated {LAST_UPDATED}</p>

      <p className="text-muted">
        These Terms of Use (“Terms”) are an agreement between you and Klect governing your use of
        the Klect app and website. By creating an account or using Klect, you agree to these Terms.
        If you don’t agree, please don’t use Klect. Your privacy is covered separately in our{" "}
        <Link href="/privacy" className="text-primary underline">
          Privacy Policy
        </Link>
        .
      </p>

      <PixelCard className="flex flex-col gap-3">
        <h2 className="text-base text-ink">Your account</h2>
        <p className="text-muted text-sm">
          You must be at least 13 years old to use Klect. You’re responsible for your account and
          for the activity that happens under it. Keep your login secure and don’t impersonate other
          people or misrepresent your identity.
        </p>
      </PixelCard>

      <PixelCard className="flex flex-col gap-3">
        <h2 className="text-base text-ink">Content you create</h2>
        <p className="text-muted text-sm">
          You own the content you add to Klect — your lists, bookmarks, comments, messages, and
          profile. You’re responsible for what you post and for having the right to post it. You
          grant Klect the limited permission needed to store and display your content to the people
          you share it with so the app can function.
        </p>
      </PixelCard>

      <PixelCard className="flex flex-col gap-3">
        <h2 className="text-base text-ink">
          Zero tolerance for objectionable content and abuse
        </h2>
        <p className="text-muted text-sm">
          Klect has <span className="text-ink">zero tolerance for objectionable content or
          abusive behavior.</span> You agree not to post, share, or send content that is unlawful,
          harassing, bullying, hateful, threatening, defamatory, pornographic or sexually explicit,
          violent, or that infringes anyone’s rights — and not to use Klect to abuse, stalk, or
          harm other people. Spam and scams are also prohibited.
        </p>
        <p className="text-muted text-sm">
          By using Klect you acknowledge there is no tolerance for objectionable content or abusive
          users, and that violating this policy may result in your content being removed and your
          account suspended or permanently terminated.
        </p>
      </PixelCard>

      <PixelCard className="flex flex-col gap-3">
        <h2 className="text-base text-ink">Reporting, blocking &amp; moderation</h2>
        <p className="text-muted text-sm">
          Every place people can post — comments, direct messages, and list chatrooms — and every
          user profile includes a way to <span className="text-ink">report</span> objectionable
          content and to <span className="text-ink">block</span> an abusive user. Blocking a user
          immediately stops their messages, removes any connection between you, and hides their
          content from you.
        </p>
        <p className="text-muted text-sm">
          We review reports and act on them — removing offending content and ejecting abusive users
          — <span className="text-ink">within 24 hours</span>. To report content, use the report
          action next to it; to block a user, open their profile and choose Block. You can also
          email us at{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline">
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </PixelCard>

      <PixelCard className="flex flex-col gap-3">
        <h2 className="text-base text-ink">Acceptable use</h2>
        <ul className="text-muted text-sm flex flex-col gap-2 list-disc pl-5">
          <li>Don’t break the law or infringe others’ rights.</li>
          <li>Don’t attempt to hack, disrupt, or overload the service.</li>
          <li>Don’t scrape or misuse other users’ data.</li>
          <li>Don’t use Klect to distribute malware, spam, or scams.</li>
        </ul>
      </PixelCard>

      <PixelCard className="flex flex-col gap-3">
        <h2 className="text-base text-ink">Termination</h2>
        <p className="text-muted text-sm">
          You can delete your account at any time from{" "}
          <span className="text-ink">Settings → Danger zone</span>. We may suspend or terminate
          accounts that violate these Terms. Some provisions survive termination, including content
          ownership and the limitations below.
        </p>
      </PixelCard>

      <PixelCard className="flex flex-col gap-3">
        <h2 className="text-base text-ink">Disclaimers &amp; limitation of liability</h2>
        <p className="text-muted text-sm">
          Klect is provided “as is,” without warranties of any kind. To the extent permitted by law,
          Klect is not liable for indirect or incidental damages arising from your use of the app,
          or for content posted by other users.
        </p>
      </PixelCard>

      <PixelCard className="flex flex-col gap-3">
        <h2 className="text-base text-ink">Changes to these Terms</h2>
        <p className="text-muted text-sm">
          We may update these Terms from time to time. When we do, we’ll revise the “last updated”
          date above. Significant changes will be communicated in the app.
        </p>
      </PixelCard>

      <PixelCard className="flex flex-col gap-3">
        <h2 className="text-base text-ink">Contact us</h2>
        <p className="text-muted text-sm">
          Questions about these Terms? Email us at{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline">
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </PixelCard>
    </main>
  );
}
