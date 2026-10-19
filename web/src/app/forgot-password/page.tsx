import type { Metadata } from "next";
import { PixelCard } from "@/components/ui/PixelCard";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata: Metadata = {
  title: "Forgot password",
  description: "Request a link to reset your Klect password.",
};

/**
 * Step 1 of password reset: ask for an email, mail a one-time link. Public by design (a
 * locked-out user has no session), and reused by the mobile app, which opens this page in an
 * in-app browser instead of shipping a native reset flow. Step 2 is `/reset-password`.
 */
export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-3xl text-primary">Klect</h1>
        <p className="mt-3 text-muted">Forgot your password?</p>
      </div>
      <PixelCard>
        <ForgotPasswordForm />
      </PixelCard>
    </main>
  );
}
