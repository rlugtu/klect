"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { setFlashToast } from "@/lib/toast-flash";
import { submitFeedback } from "@/lib/core/feedback";

/** Submit app feedback from the web Settings form, then return to Settings. */
export async function sendFeedback(formData: FormData) {
  const user = await requireUser();
  await submitFeedback(user.id, {
    category: String(formData.get("category") ?? "other"),
    message: String(formData.get("message") ?? ""),
    platform: "web",
  });

  await setFlashToast("success", "Thanks for the feedback!");
  redirect("/settings");
}
