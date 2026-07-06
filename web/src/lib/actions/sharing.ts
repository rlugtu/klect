"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import * as core from "@/lib/core/sharing";

export type { InviteState, InviteRole } from "@/lib/core/sharing";

function parseInviteRole(value: FormDataEntryValue | null): core.InviteRole {
  return value === "COLLABORATOR" ? "COLLABORATOR" : "VIEWER";
}

export async function inviteToList(
  listId: string,
  _prev: core.InviteState,
  formData: FormData,
): Promise<core.InviteState> {
  const user = await requireUser();
  const result = await core.inviteToList(user.id, user.email, listId, {
    email: String(formData.get("email") ?? ""),
    role: parseInviteRole(formData.get("role")),
  });

  revalidatePath(`/lists/${listId}`);
  return result;
}

export async function changeMemberRole(
  listId: string,
  userId: string,
  role: core.InviteRole,
) {
  const actor = await requireUser();
  await core.changeMemberRole(actor.id, listId, userId, role);
  revalidatePath(`/lists/${listId}`);
}

export async function removeMember(listId: string, userId: string) {
  const actor = await requireUser();
  await core.removeMember(actor.id, listId, userId);
  revalidatePath(`/lists/${listId}`);
}

export async function revokeInvite(inviteId: string) {
  const actor = await requireUser();
  const result = await core.revokeInvite(actor.id, inviteId);
  if (result) revalidatePath(`/lists/${result.listId}`);
}

export async function leaveList(listId: string) {
  const user = await requireUser();
  await core.leaveList(user.id, listId);
  revalidatePath("/");
  redirect("/");
}

export async function acceptInvite(token: string) {
  const user = await requireUser();
  const result = await core.acceptInvite(user.id, token);
  if (!result) redirect("/");

  revalidatePath("/");
  redirect(`/lists/${result.listId}`);
}
