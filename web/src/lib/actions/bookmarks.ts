"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { setFlashToast } from "@/lib/toast-flash";
import * as core from "@/lib/core/bookmarks";

/** Extract a bookmark's fields + tags from submitted FormData. */
function bookmarkInputFromFormData(formData: FormData): core.BookmarkInput {
  // Coordinates are present only when the location was picked from autocomplete;
  // free-typed text (or old rows) leaves them null.
  const toCoord = (v: FormDataEntryValue | null): number | null => {
    const s = v === null ? "" : String(v).trim();
    return s !== "" && Number.isFinite(Number(s)) ? Number(s) : null;
  };

  return {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    urls: String(formData.get("urls") ?? "").split(/\r?\n/),
    images: formData.getAll("images").map((u) => String(u)),
    notes: String(formData.get("notes") ?? ""),
    location: String(formData.get("location") ?? ""),
    latitude: toCoord(formData.get("latitude")),
    longitude: toCoord(formData.get("longitude")),
    rating: Number(formData.get("rating") ?? 0),
    visited: formData.get("visited") === "on",
    videoUrl: String(formData.get("videoUrl") ?? ""),
    videoType: String(formData.get("videoType") ?? ""),
    tagNames: formData.getAll("tags").map((t) => String(t)),
  };
}

export async function createBookmark(listId: string, formData: FormData) {
  const user = await requireUser();
  await core.createBookmark(user.id, listId, bookmarkInputFromFormData(formData));

  // Stay on the list so the create panel can close and the new card appears.
  revalidatePath(`/lists/${listId}`);
}

export async function createBookmarkInLists(
  existingListIds: string[],
  newListNames: string[],
  formData: FormData,
) {
  const user = await requireUser();
  const { targetIds } = await core.createBookmarkInLists(
    user.id,
    existingListIds,
    newListNames,
    bookmarkInputFromFormData(formData),
    formData.get("newListsPublic") === "on",
  );

  revalidatePath("/");
  for (const listId of targetIds) revalidatePath(`/lists/${listId}`);
}

export async function updateBookmark(bookmarkId: string, formData: FormData) {
  const user = await requireUser();
  const { listId } = await core.updateBookmark(
    user.id,
    bookmarkId,
    bookmarkInputFromFormData(formData),
  );

  revalidatePath(`/lists/${listId}`);
  revalidatePath(`/lists/${listId}/bookmarks/${bookmarkId}`);
}

export async function deleteBookmark(bookmarkId: string) {
  const user = await requireUser();
  const { listId } = await core.deleteBookmark(user.id, bookmarkId);

  revalidatePath(`/lists/${listId}`);
  await setFlashToast("success", "Bookmark deleted");
  redirect(`/lists/${listId}`);
}

/** Quick toggle of the visited flag from a card/detail. */
export async function toggleVisited(bookmarkId: string) {
  const user = await requireUser();
  const { listId } = await core.toggleVisited(user.id, bookmarkId);

  revalidatePath(`/lists/${listId}`);
  revalidatePath(`/lists/${listId}/bookmarks/${bookmarkId}`);
}

/** Quick inline set of the 0–5 rating from the detail view. */
export async function setRating(bookmarkId: string, rating: number) {
  const user = await requireUser();
  const { listId } = await core.setRating(user.id, bookmarkId, rating);

  revalidatePath(`/lists/${listId}`);
  revalidatePath(`/lists/${listId}/bookmarks/${bookmarkId}`);
}
