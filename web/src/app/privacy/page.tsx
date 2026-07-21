import type { Metadata } from "next";
import Link from "next/link";
import { PixelCard } from "@/components/ui/PixelCard";
import { PixelButton } from "@/components/ui/PixelButton";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Klect collects, uses, and protects your data, and how to delete your account.",
};

/**
 * Public privacy policy — reachable without signing in (this route intentionally does NOT call
 * requireOnboardedUser) so it can serve as the App Store Connect "Privacy Policy URL". Linked from
 * Settings on both the web and mobile apps. Plain-language on purpose. Last updated below.
 */
const LAST_UPDATED = "July 17, 2026";
const CONTACT_EMAIL = "ryanlugtu@gmail.com";

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-lg px-6 py-12 flex flex-col gap-8">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl text-primary">Privacy Policy</h1>
        <Link href="/">
          <PixelButton variant="ghost" size="sm">
            ← Home
          </PixelButton>
        </Link>
      </header>

      <p className="text-muted text-sm">Last updated {LAST_UPDATED}</p>

      <p className="text-muted">
        Klect is a bookmarking app where your bookmarks live inside shareable lists. This policy
        explains, in plain terms, what information Klect collects, how it’s used, who it’s shared
        with, and the choices you have — including how to delete your account and all of your data.
      </p>

      <PixelCard className="flex flex-col gap-3">
        <h2 className="text-base text-ink">Information we collect</h2>
        <p className="text-muted text-sm">We only collect what the app needs to work:</p>
        <ul className="text-muted text-sm flex flex-col gap-2 list-disc pl-5">
          <li>
            <span className="text-ink">Account details</span> — your email address, your unique
            @handle, and anything you choose to add to your profile (name, avatar, and theme).
          </li>
          <li>
            <span className="text-ink">Content you create</span> — your lists and bookmarks
            (names, descriptions, links, photos, notes, ratings, tags), comments, poll votes,
            direct messages, and list chatroom messages.
          </li>
          <li>
            <span className="text-ink">Location you add</span> — if you attach a place to a
            bookmark or use “Near me,” we store the location you pick. “Near me” reads your device’s
            current location on-device to find bookmarks nearby; that live location is not stored.
          </li>
          <li>
            <span className="text-ink">Sign-in data</span> — if you sign in with Google, we receive
            your basic Google account info to authenticate you. If you use email and password, your
            password is stored only as a secure one-way hash.
          </li>
        </ul>
      </PixelCard>

      <PixelCard className="flex flex-col gap-3">
        <h2 className="text-base text-ink">How we use your information</h2>
        <ul className="text-muted text-sm flex flex-col gap-2 list-disc pl-5">
          <li>To create your account and sign you in.</li>
          <li>To store and display your lists, bookmarks, and messages.</li>
          <li>To share lists with the people you invite and show public lists on your profile.</li>
          <li>To automatically fill in bookmark details from a link you paste.</li>
          <li>To keep the app secure and working correctly.</li>
        </ul>
        <p className="text-muted text-sm">
          We do not sell your personal information, and we do not use it for advertising.
        </p>
      </PixelCard>

      <PixelCard className="flex flex-col gap-3">
        <h2 className="text-base text-ink">How your information is shared</h2>
        <p className="text-muted text-sm">
          You control most sharing through how you use Klect:
        </p>
        <ul className="text-muted text-sm flex flex-col gap-2 list-disc pl-5">
          <li>
            <span className="text-ink">Lists you share</span> are visible to the viewers and
            collaborators you invite, along with your @handle and role.
          </li>
          <li>
            <span className="text-ink">Public lists</span> are readable by anyone and appear on
            your public profile. Lists are private by default.
          </li>
          <li>
            <span className="text-ink">Friends and messages</span> — friends you add can see your
            @handle and send you direct messages.
          </li>
        </ul>
        <p className="text-muted text-sm">
          We share data with a small number of service providers who help us run the app, and only
          so they can provide their service to us:
        </p>
        <ul className="text-muted text-sm flex flex-col gap-2 list-disc pl-5">
          <li>
            <span className="text-ink">Vercel</span> — app hosting.
          </li>
          <li>
            <span className="text-ink">Supabase</span> — database and real-time message delivery.
          </li>
          <li>
            <span className="text-ink">Google</span> — optional sign-in.
          </li>
          <li>
            <span className="text-ink">Mapbox</span> — location search suggestions when you add a
            place.
          </li>
        </ul>
      </PixelCard>

      <PixelCard className="flex flex-col gap-3">
        <h2 className="text-base text-ink">Data retention and deletion</h2>
        <p className="text-muted text-sm">
          We keep your information for as long as your account is active. You can permanently delete
          your account at any time from <span className="text-ink">Settings → Danger zone</span> on
          the web or in the mobile app. Deleting your account immediately and permanently removes
          your profile, your lists and their bookmarks, your comments, polls, votes, tags,
          friendships, direct messages, and list chatroom messages. This action cannot be undone.
        </p>
      </PixelCard>

      <PixelCard className="flex flex-col gap-3">
        <h2 className="text-base text-ink">Security</h2>
        <p className="text-muted text-sm">
          Your data is transmitted over encrypted connections and stored with our hosting and
          database providers. Passwords are never stored in plain text. No system is perfectly
          secure, but we take reasonable steps to protect your information.
        </p>
      </PixelCard>

      <PixelCard className="flex flex-col gap-3">
        <h2 className="text-base text-ink">Children</h2>
        <p className="text-muted text-sm">
          Klect is not directed to children under 13, and we do not knowingly collect personal
          information from them. If you believe a child has provided us information, please contact
          us and we will delete it.
        </p>
      </PixelCard>

      <PixelCard className="flex flex-col gap-3">
        <h2 className="text-base text-ink">Changes to this policy</h2>
        <p className="text-muted text-sm">
          We may update this policy from time to time. When we do, we’ll revise the “last updated”
          date above. Significant changes will be communicated in the app.
        </p>
      </PixelCard>

      <PixelCard className="flex flex-col gap-3">
        <h2 className="text-base text-ink">Contact us</h2>
        <p className="text-muted text-sm">
          Questions about your privacy or this policy? Email us at{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline">
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </PixelCard>
    </main>
  );
}
