"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelInput } from "@/components/ui/PixelInput";
import { FieldLabel } from "@/components/ui/FieldLabel";

/** Server-enforced minimum too (better-auth's `minPasswordLength`), same as signup. */
const MIN_PASSWORD = 8;

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);
    if (password.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }

    setLoading(true);
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    setLoading(false);

    if (error) {
      // The token is single-use and consumed on the first valid attempt, so any failure
      // here is most likely a stale link; offer a fresh one rather than a bare error.
      setExpired(true);
      setError(error.message ?? "That reset link is no longer valid.");
      return;
    }

    // resetPassword only rewrites the credential, it does not open a session, so finish at
    // the login screen with a success notice instead of pretending they're signed in.
    router.push("/login?reset=1");
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-4"
    >
      <p className="text-muted text-sm">Choose a new password for your account.</p>

      <label className="flex flex-col gap-1.5 text-sm">
        <FieldLabel>New password</FieldLabel>
        <PixelInput
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="new-password"
          minLength={MIN_PASSWORD}
          autoFocus
          required
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <FieldLabel>Confirm password</FieldLabel>
        <PixelInput
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="••••••••"
          autoComplete="new-password"
          minLength={MIN_PASSWORD}
          required
        />
      </label>

      {error && (
        <p className="text-danger text-sm" role="alert">
          {error}
        </p>
      )}

      {expired ? (
        <Link href="/forgot-password">
          <PixelButton type="button" size="lg" className="w-full">
            Request a new link
          </PixelButton>
        </Link>
      ) : (
        <PixelButton type="submit" size="lg" className="w-full" disabled={loading}>
          {loading ? "…" : "Set new password"}
        </PixelButton>
      )}

      <Link
        href="/login"
        className="text-muted text-center text-sm hover:text-ink"
      >
        Back to sign in
      </Link>
    </form>
  );
}
