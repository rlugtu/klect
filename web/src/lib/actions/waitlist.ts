"use server";

import { addWaitlistSignup } from "@/lib/core/waitlist";

/**
 * Public (no auth) waitlist capture for the marketing landing page.
 * Returns `{ ok }` so the client form can show a confirmation or an error.
 */
export async function joinWaitlist(email: string): Promise<{ ok: boolean }> {
  const ok = await addWaitlistSignup(email);
  return { ok };
}
