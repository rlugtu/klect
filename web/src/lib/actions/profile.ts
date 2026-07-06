"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { coerceTheme } from "@/lib/theme";
import { saveProfile, type ProfileInput } from "@/lib/core/profile";

function profileInputFromFormData(formData: FormData): ProfileInput {
  const str = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v.length ? v : null;
  };
  const birthdayRaw = str("birthday");

  return {
    firstName: str("firstName"),
    lastName: str("lastName"),
    displayName: str("displayName") ?? "",
    birthday: birthdayRaw ? new Date(birthdayRaw) : null,
    icon: str("icon"),
    theme: coerceTheme(str("theme")),
  };
}

/** First-run onboarding: save profile, then land on the home page. */
export async function completeOnboarding(formData: FormData) {
  const user = await requireUser();
  await saveProfile(user.id, profileInputFromFormData(formData));
  redirect("/");
}

/** Settings: save profile changes in place. */
export async function updateProfile(formData: FormData) {
  const user = await requireUser();
  await saveProfile(user.id, profileInputFromFormData(formData));
  revalidatePath("/settings");
  revalidatePath("/");
}
