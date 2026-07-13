"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import * as core from "@/lib/core/friends";
import {
  addFriendToLists as addFriendToListsCore,
  type InviteState,
  type InviteRole,
} from "@/lib/core/sharing";

export type { FriendState } from "@/lib/core/friends";
export type { InviteState } from "@/lib/core/sharing";

function parseInviteRole(value: FormDataEntryValue | null): InviteRole {
  return value === "COLLABORATOR" ? "COLLABORATOR" : "VIEWER";
}

export async function sendFriendRequest(
  _prev: core.FriendState,
  formData: FormData,
): Promise<core.FriendState> {
  const user = await requireUser();
  const result = await core.sendFriendRequest(
    user.id,
    user.email,
    String(formData.get("email") ?? ""),
  );
  revalidatePath("/friends");
  return result;
}

export async function acceptFriendRequest(id: string) {
  const user = await requireUser();
  await core.acceptFriendRequest(user.id, id);
  revalidatePath("/friends");
}

export async function declineFriendRequest(id: string) {
  const user = await requireUser();
  await core.declineFriendRequest(user.id, id);
  revalidatePath("/friends");
}

export async function removeFriend(id: string) {
  const user = await requireUser();
  await core.removeFriend(user.id, id);
  revalidatePath("/friends");
}

/** "Add as friend too?" button from the list members panel. */
export async function offerFriend(email: string): Promise<core.FriendState> {
  const user = await requireUser();
  return core.sendFriendRequest(user.id, user.email, email);
}

/** Send a friend request straight to a user by id (from their profile page). */
export async function sendFriendRequestToUser(targetUserId: string) {
  const user = await requireUser();
  await core.sendFriendRequestById(user.id, targetUserId);
  revalidatePath(`/users/${targetUserId}`);
}

export async function addFriendToLists(
  friendId: string,
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const user = await requireUser();
  const listIds = formData.getAll("listIds").map(String);
  const role = parseInviteRole(formData.get("role"));
  const result = await addFriendToListsCore(user.id, friendId, listIds, role);
  revalidatePath("/friends");
  return result;
}
