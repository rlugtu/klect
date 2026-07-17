"use client";

import { useState } from "react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Beta early-access email capture. Faithful to the source design: validates the
 * address client-side and shows a confirmation. There is no waitlist backend yet,
 * so nothing is persisted — swap `onSubmit` for a server action when one lands.
 *
 * `variant`:
 *  - "hero"  — dark solid button on the light hero background.
 *  - "cta"   — same, sitting on the gradient beta panel (white input, centered).
 */
export function WaitlistForm({ variant = "hero" }: { variant?: "hero" | "cta" }) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
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
        onSubmit={(e) => {
          e.preventDefault();
          if (!EMAIL_RE.test(email)) {
            setError("Enter a valid email");
            return;
          }
          setError("");
          setSubmitted(true);
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
          className="cursor-pointer whitespace-nowrap rounded-full border-none bg-[#15141A] px-7 py-[15px] text-base font-bold text-white transition-colors hover:bg-[#6657E0]"
        >
          {isCta ? "Join beta" : "Get early access"}
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
