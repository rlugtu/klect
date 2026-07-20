import { prisma } from "@/lib/db";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Persist a beta early-access signup from the logged-out landing page.
 * Email is normalized (trim + lowercase); re-signing up is idempotent (no
 * duplicate rows, no error). Returns whether the input was a valid email.
 */
export async function addWaitlistSignup(rawEmail: string): Promise<boolean> {
  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return false;

  await prisma.waitlistSignup.upsert({
    where: { email },
    update: {},
    create: { email },
  });
  return true;
}
