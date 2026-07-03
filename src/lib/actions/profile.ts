"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { coerceTheme } from "@/lib/theme";
import { type Theme } from "@/generated/prisma/enums";

type ProfileInput = {
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  birthday: Date | null;
  icon: string | null;
  theme: Theme;
};

function parseProfile(formData: FormData): ProfileInput {
  const str = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v.length ? v : null;
  };
  const displayName = str("displayName");
  if (!displayName) throw new Error("Display name is required.");

  const birthdayRaw = str("birthday");
  const birthday = birthdayRaw ? new Date(birthdayRaw) : null;

  return {
    firstName: str("firstName"),
    lastName: str("lastName"),
    displayName,
    birthday,
    icon: str("icon"),
    theme: coerceTheme(str("theme")),
  };
}

/** First-run onboarding: save profile, then land on the home page. */
export async function completeOnboarding(formData: FormData) {
  const user = await requireUser();
  const data = parseProfile(formData);
  await prisma.user.update({ where: { id: user.id }, data });
  redirect("/");
}

/** Settings: save profile changes in place. */
export async function updateProfile(formData: FormData) {
  const user = await requireUser();
  const data = parseProfile(formData);
  await prisma.user.update({ where: { id: user.id }, data });
  revalidatePath("/settings");
  revalidatePath("/");
}
