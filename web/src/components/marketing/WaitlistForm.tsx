"use client";

import { useState } from "react";
import { joinWaitlist } from "@/lib/actions/waitlist";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Beta early-access email capture. Validates the address client-side, then
 * persists it via the `joinWaitlist` server action (stored in the
 * `WaitlistSignup` table; review in Supabase / `prisma studio`).
 *
 * `variant`:
 *  - "hero"  — dark solid button on the light hero background.
 *  - "cta"   — same, sitting on the gradient beta panel (white input, centered).
 */
export function WaitlistForm({ variant = "hero" }: { variant?: "hero" | "cta" }) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const isCta = variant === "cta";

  if (submitted) {
    return isCta ? (
      <div className="rounded-2xl bg-white/95 px-7 py-6 text-base font-semibold text-[#15141A]">
        You&apos;re on the list! Watch your inbox 🎉
      </div>
    ) : (
      <div className="inline-block rounded-full bg-[#EDEBFB] px-6 py-4 text-[15.5px] font-semibold text-[#15141A]">
        You&apos;re on the list! Watch your inbox 🎉
      </div>
    );
  }

  return (
    <div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!EMAIL_RE.test(email)) {
            setError("Enter a valid email");
            return;
          }
          setError("");
          setPending(true);
          try {
            const { ok } = await joinWaitlist(email);
            if (ok) {
              setSubmitted(true);
            } else {
              setError("Enter a valid email");
            }
          } catch {
            setError("Something went wrong — try again");
          } finally {
            setPending(false);
          }
        }}
        className={`flex flex-wrap gap-2.5 ${
          isCta ? "justify-center" : "mb-3"
        }`}
      >
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError("");
          }}
          placeholder="you@email.com"
          required
          aria-label="Email address"
          className={`min-w-[200px] flex-1 rounded-full px-5 py-[15px] text-base outline-none focus:ring-2 focus:ring-[#6657E0]/40 ${
            isCta
              ? "basis-[260px] border-none"
              : "basis-[220px] border border-[#E2DFD6] bg-white text-[#15141A]"
          }`}
        />
        <button
          type="submit"
          disabled={pending}
          className="cursor-pointer whitespace-nowrap rounded-full border-none bg-[#15141A] px-7 py-[15px] text-base font-bold text-white transition-colors hover:bg-[#6657E0] disabled:cursor-default disabled:opacity-70"
        >
          {pending ? "Joining…" : isCta ? "Join beta" : "Get early access"}
        </button>
      </form>
      <p
        className={`text-[13px] ${
          isCta ? "mt-[18px] text-white/75" : "mb-1 text-[#B03333]/70"
        }`}
        role={error ? "alert" : undefined}
      >
        {error || " "}
      </p>
    </div>
  );
}
