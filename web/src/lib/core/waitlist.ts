import { prisma } from "@/lib/db";
import { sendWaitlistWelcome } from "@/lib/core/email";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Persist a beta early-access signup from the logged-out landing page.
 * Email is normalized (trim + lowercase); re-signing up is idempotent (no
 * duplicate rows, no error). Returns whether the input was a valid email.
 *
 * On a *first-time* signup we fire a welcome email best-effort (never blocks the
 * write; no-ops when EmailJS is unconfigured). Repeat submits of a known email skip
 * the send so no one gets spammed.
 */
export async function addWaitlistSignup(rawEmail: string): Promise<boolean> {
  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return false;

  const existing = await prisma.waitlistSignup.findUnique({ where: { email } });
  await prisma.waitlistSignup.upsert({
    where: { email },
    update: {},
    create: { email },
  });

  if (!existing) await sendWaitlistWelcome(email);
  return true;
}
