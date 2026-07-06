"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelInput } from "@/components/ui/PixelInput";
import { FieldLabel } from "@/components/ui/FieldLabel";

type Mode = "signin" | "signup";

export function LoginForm({ next = "/" }: { next?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submitCredentials() {
    setError(null);
    setLoading(true);

    const { error } =
      mode === "signin"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name });

    setLoading(false);
    if (error) {
      setError(error.message ?? "Something went wrong.");
      return;
    }
    // New users have no displayName yet → home guard sends them to onboarding.
    router.push(next);
    router.refresh();
  }

  async function handleGoogle() {
    setError(null);
    await authClient.signIn.social({ provider: "google", callbackURL: next });
  }

  return (
    <div className="flex flex-col gap-6">
      <PixelButton
        type="button"
        variant="secondary"
        size="lg"
        className="w-full"
        onClick={handleGoogle}
      >
        Continue with Google
      </PixelButton>

      <div className="flex items-center gap-3 text-muted text-sm">
        <span className="h-0.5 flex-1 bg-border" />
        or
        <span className="h-0.5 flex-1 bg-border" />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submitCredentials();
        }}
        className="flex flex-col gap-4"
      >
        {mode === "signup" && (
          <label className="flex flex-col gap-1.5 text-sm">
            <FieldLabel>Name</FieldLabel>
            <PixelInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Player One"
              required
            />
          </label>
        )}

        <label className="flex flex-col gap-1.5 text-sm">
          <FieldLabel>Email</FieldLabel>
          <PixelInput
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <FieldLabel>Password</FieldLabel>
          <PixelInput
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            minLength={8}
            required
          />
        </label>

        {error && (
          <p className="text-danger text-sm" role="alert">
            {error}
          </p>
        )}

        <PixelButton type="submit" size="lg" className="w-full" disabled={loading}>
          {loading
            ? "…"
            : mode === "signin"
              ? "Sign in"
              : "Create account"}
        </PixelButton>
      </form>

      <button
        type="button"
        className="text-muted text-sm hover:text-ink cursor-pointer"
        onClick={() => {
          setMode(mode === "signin" ? "signup" : "signin");
          setError(null);
        }}
      >
        {mode === "signin"
          ? "New here? Create an account"
          : "Already have an account? Sign in"}
      </button>
    </div>
  );
}
