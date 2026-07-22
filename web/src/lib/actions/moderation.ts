"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import * as core from "@/lib/core/moderation";

/** Block a user from their profile (or anywhere a handle-linked profile is shown). */
export async function blockUser(targetUserId: string, handle?: string) {
  const user = await requireUser();
  await core.blockUser(user.id, targetUserId);
  if (handle) revalidatePath(`/users/${handle}`);
  revalidatePath(`/users/${targetUserId}`);
  revalidatePath("/settings");
}

/** Reverse a block (from the profile or the Blocked-users settings view). */
export async function unblockUser(targetUserId: string, handle?: string) {
  const user = await requireUser();
  await core.unblockUser(user.id, targetUserId);
  if (handle) revalidatePath(`/users/${handle}`);
  revalidatePath(`/users/${targetUserId}`);
  revalidatePath("/settings");
}

/** Submit a report of an abusive user or a piece of objectionable content. */
export async function reportContent(input: core.ReportInput) {
  const user = await requireUser();
  await core.submitReport(user.id, input);
}
