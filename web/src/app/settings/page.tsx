import Link from "next/link";
import { requireOnboardedUser } from "@/lib/session";
import { coerceTheme } from "@/lib/theme";
import { updateProfile } from "@/lib/actions/profile";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { DeleteAccountSection } from "@/components/settings/DeleteAccountSection";
import { PixelCard } from "@/components/ui/PixelCard";
import { PixelButton } from "@/components/ui/PixelButton";

export default async function SettingsPage() {
  const user = await requireOnboardedUser();

  return (
    <main className="mx-auto w-full max-w-lg px-6 py-12 flex flex-col gap-8">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl text-primary">Settings</h1>
        <Link href="/">
          <PixelButton variant="ghost" size="sm">
            ← Home
          </PixelButton>
        </Link>
      </header>

      <PixelCard>
        <h2 className="text-sm mb-5">Profile</h2>
        <ProfileForm
          action={updateProfile}
          submitLabel="Save changes"
          defaults={{
            firstName: user.firstName ?? null,
            lastName: user.lastName ?? null,
            handle: user.handle ?? null,
            icon: user.icon ?? null,
            theme: coerceTheme(user.theme),
          }}
        />
      </PixelCard>

      <PixelCard>
        <h2 className="text-sm mb-4">iOS share sheet</h2>
        <p className="text-muted mb-4 text-sm">
          Save links to Klect from any app on your iPhone — no copy-pasting.
        </p>
        <Link href="/settings/share-extension">
          <PixelButton variant="secondary" size="sm">
            Learn how →
          </PixelButton>
        </Link>
      </PixelCard>

      <PixelCard>
        <h2 className="text-sm mb-4">Privacy</h2>
        <p className="text-muted mb-4 text-sm">
          Read how Klect collects, uses, and protects your data.
        </p>
        <Link href="/privacy">
          <PixelButton variant="secondary" size="sm">
            Privacy Policy →
          </PixelButton>
        </Link>
      </PixelCard>

      <PixelCard>
        <h2 className="text-sm mb-4">Account</h2>
        <p className="text-muted mb-1">
          Signed in as <span className="text-ink">@{user.handle}</span>
        </p>
        <p className="text-muted mb-4 text-sm">{user.email}</p>
        <SignOutButton />
      </PixelCard>

      <DeleteAccountSection handle={user.handle ?? ""} />
    </main>
  );
}
