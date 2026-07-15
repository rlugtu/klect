import "server-only";
import { prisma } from "@/lib/db";
import { type Theme } from "@/generated/prisma/enums";

export type ProfileInput = {
  handle: string;
  firstName: string | null;
  lastName: string | null;
  birthday: Date | null;
  icon: string | null;
  theme: Theme;
};

/** Public @handle: lowercase letters/digits/underscore, 3–20 chars. Stored
 *  normalized (lowercased) so uniqueness is case-insensitive — the `@` is
 *  display-only and never stored. */
const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

/** Normalize + validate a raw handle; throws a friendly error if malformed. */
export function normalizeHandle(raw: string): string {
  const handle = raw.trim().toLowerCase();
  if (!handle) throw new Error("Handle is required.");
  if (!HANDLE_RE.test(handle))
    throw new Error(
      "Handle must be 3–20 characters: lowercase letters, numbers, or underscores.",
    );
  return handle;
}

/** Save the user's profile fields (onboarding and settings share this). */
export async function saveProfile(userId: string, input: ProfileInput) {
  const handle = normalizeHandle(input.handle);
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { ...input, handle },
    });
  } catch (e) {
    // Unique violation on the handle column → surface a friendly message.
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code?: string }).code === "P2002"
    ) {
      throw new Error("That handle is taken.");
    }
    throw e;
  }
}
