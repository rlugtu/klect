import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { coerceTheme } from "@/lib/theme";
import { completeOnboarding } from "@/lib/actions/profile";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { PixelCard } from "@/components/ui/PixelCard";

export default async function OnboardingPage() {
  const user = await requireUser();
  // Already onboarded → skip.
  if (user.handle) redirect("/");

  return (
    <main className="mx-auto w-full max-w-lg px-6 py-12">
      <div className="mb-6 text-center">
        <h1 className="text-2xl text-primary">New Player</h1>
        <p className="mt-3 text-muted">Set up your profile to start saving.</p>
      </div>
      <PixelCard>
        <ProfileForm
          action={completeOnboarding}
          submitLabel="Enter Klect"
          defaults={{
            firstName: user.firstName ?? null,
            lastName: user.lastName ?? null,
            handle: user.handle ?? null,
            icon: user.icon ?? null,
            theme: coerceTheme(user.theme),
          }}
        />
      </PixelCard>
    </main>
  );
}
