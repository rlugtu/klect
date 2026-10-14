"use client";

import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelInput } from "@/components/ui/PixelInput";
import { FieldLabel } from "@/components/ui/FieldLabel";

/**
 * Step 1 of the forgot-password flow: mail a reset link. `redirectTo` is where
 * better-auth's token-verifying endpoint sends the user after they click the link, and it
 * is resolved against the auth base URL, so the leading slash matters.
 */
const RESET_PAGE = "/reset-password";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    // Deliberately unchecked: better-auth answers identically for a known and an unknown
    // address, and surfacing a failure here would be the one thing that tells them apart.
    await authClient.requestPasswordReset({ email, redirectTo: RESET_PAGE });
    setLoading(false);
    setSent(true);
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-5 text-center">
        <p className="text-success text-sm" role="status">
          If an account exists for that email, we&apos;ve sent a reset link.
        </p>
        <p className="text-muted text-xs">
          The link works once and expires in an hour. Check your spam folder if it
          doesn&apos;t show up.
        </p>
        <Link href="/login">
          <PixelButton variant="secondary" className="w-full">
            Back to sign in
          </PixelButton>
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-4"
    >
      <p className="text-muted text-sm">
        Enter your email and we&apos;ll send a link to set a new password.
      </p>

      <label className="flex flex-col gap-1.5 text-sm">
        <FieldLabel>Email</FieldLabel>
        <PixelInput
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          autoFocus
          required
        />
      </label>

      <PixelButton type="submit" size="lg" className="w-full" disabled={loading}>
        {loading ? "…" : "Send reset link"}
      </PixelButton>

      <Link
        href="/login"
        className="text-muted text-center text-sm hover:text-ink"
      >
        Back to sign in
      </Link>
    </form>
  );
}
