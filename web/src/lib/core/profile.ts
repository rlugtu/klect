import "server-only";
import { prisma } from "@/lib/db";
import { type Theme } from "@/generated/prisma/enums";

export type ProfileInput = {
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  birthday: Date | null;
  icon: string | null;
  theme: Theme;
};

/** Save the user's profile fields (onboarding and settings share this). */
export async function saveProfile(userId: string, input: ProfileInput) {
  if (!input.displayName?.trim()) throw new Error("Display name is required.");
  await prisma.user.update({ where: { id: userId }, data: input });
}
