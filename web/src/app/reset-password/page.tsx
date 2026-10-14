import type { Metadata } from "next";
import Link from "next/link";
import { PixelCard } from "@/components/ui/PixelCard";
import { PixelButton } from "@/components/ui/PixelButton";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const metadata: Metadata = {
  title: "Reset password",
  description: "Set a new password for your Klect account.",
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-3xl text-primary">KLECT</h1>
        <p className="mt-3 text-muted">Reset your password.</p>
      </div>
      <PixelCard>{children}</PixelCard>
    </main>
  );
}

/**
 * Step 2 of password reset, the landing spot for the emailed link. Public by design. The
 * link points at better-auth's `/api/auth/reset-password/<token>` endpoint, which checks the
 * token before redirecting here with either `?token=…` or `?error=INVALID_TOKEN`, so a dead
 * link never gets as far as the form.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  if (!token || error) {
    return (
      <Shell>
        <div className="flex flex-col gap-5 text-center">
          <h2 className="text-lg text-primary">Link expired</h2>
          <p className="text-muted text-sm">
            Reset links work once and expire after an hour. Request a new one and we&apos;ll
            email it over.
          </p>
          <Link href="/forgot-password">
            <PixelButton className="w-full">Request a new link</PixelButton>
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <ResetPasswordForm token={token} />
    </Shell>
  );
}
