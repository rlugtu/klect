"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import * as core from "@/lib/core/dms";
import { saveSharedBookmark as saveSharedBookmarkCore } from "@/lib/core/bookmarks";
import { getUserLists } from "@/lib/lists";
import { roleAtLeast } from "@/lib/permissions";
import {
  getConversations,
  getMessages,
  getUnreadConversationCount,
} from "@/lib/dms";

export type { ConversationSummary as DmConversation, MessagesPage } from "@/lib/dms";
export type { SharedBookmarkSnapshot } from "@/lib/core/bookmarks";

// Mutations
export async function startConversation(otherUserId: string) {
  const user = await requireUser();
  return core.startConversation(user.id, otherUserId);
}

export async function sendMessage(conversationId: string, body: string) {
  const user = await requireUser();
  return core.sendMessage(user.id, conversationId, body);
}

export async function clearConversation(conversationId: string) {
  const user = await requireUser();
  await core.clearConversation(user.id, conversationId);
  revalidatePath("/friends/dms");
}

export async function markRead(conversationId: string) {
  const user = await requireUser();
  await core.markRead(user.id, conversationId);
}

// Share a bookmark to one or more friends over DM. Returns per-recipient outcomes so the
// UI can toast partial failures.
export async function shareBookmark(
  bookmarkId: string,
  recipientUserIds: string[],
  caption: string,
) {
  const user = await requireUser();
  return core.shareBookmark(user.id, bookmarkId, recipientUserIds, caption);
}

// Save a bookmark shared over DM into the current user's own lists (independent copies).
export async function saveSharedBookmark(
  messageId: string,
  existingListIds: string[],
  newListNames: string[],
  newListsPublic = false,
) {
  const user = await requireUser();
  return saveSharedBookmarkCore(
    user.id,
    messageId,
    existingListIds,
    newListNames,
    newListsPublic,
  );
}

// Client-callable data loaders (web has no browser tRPC client, so the interactive DM
// islands read through these server actions — same core/data-access as the tRPC procedures).
export async function loadConversations() {
  const user = await requireUser();
  return getConversations(user.id);
}

export async function loadMessages(conversationId: string, cursor?: string) {
  const user = await requireUser();
  return getMessages(user.id, conversationId, cursor);
}

export async function loadUnreadCount() {
  const user = await requireUser();
  return getUnreadConversationCount(user.id);
}

// The lists the user can add a bookmark to (COLLABORATOR+), for the shared-bookmark save
// picker. Fetched lazily when the recipient opens the picker so threads don't load it eagerly.
export async function loadMyListOptions() {
  const user = await requireUser();
  const memberships = await getUserLists(user.id);
  return memberships
    .filter((m) => roleAtLeast(m.role, "COLLABORATOR"))
    .map((m) => ({ id: m.listId, name: m.list.name, icon: m.list.icon }));
}
