"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { assertRole } from "@/lib/permissions";
import { createListRecord } from "@/lib/lists";
import { isTrustedIframeUrl } from "@/lib/video";

type BookmarkFields = {
  name: string;
  description: string;
  urls: string[];
  images: string[];
  notes: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  rating: number;
  visited: boolean;
  videoUrl: string;
  videoType: string;
};

function parseBookmarkFields(formData: FormData): BookmarkFields {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Bookmark name is required.");

  const urls = String(formData.get("urls") ?? "")
    .split(/\r?\n/)
    .map((u) => u.trim())
    .filter(Boolean);

  const images = [
    ...new Set(
      formData
        .getAll("images")
        .map((u) => String(u).trim())
        .filter(Boolean),
    ),
  ];

  // Coordinates are present only when the location was picked from autocomplete;
  // free-typed text (or old rows) leaves them null.
  const toCoord = (v: FormDataEntryValue | null): number | null => {
    const s = v === null ? "" : String(v).trim();
    return s !== "" && Number.isFinite(Number(s)) ? Number(s) : null;
  };
  const latitude = toCoord(formData.get("latitude"));
  const longitude = toCoord(formData.get("longitude"));

  const ratingRaw = Number(formData.get("rating") ?? 0);
  const rating = Number.isFinite(ratingRaw)
    ? Math.min(5, Math.max(0, Math.round(ratingRaw)))
    : 0;

  // Video: keep only a trusted-host iframe embed or an https direct file.
  let videoType = String(formData.get("videoType") ?? "").trim();
  let videoUrl = String(formData.get("videoUrl") ?? "").trim();
  const okFile = videoType === "file" && /^https:\/\//i.test(videoUrl);
  const okIframe = videoType === "iframe" && isTrustedIframeUrl(videoUrl);
  if (!okFile && !okIframe) {
    videoType = "";
    videoUrl = "";
  }

  return {
    name,
    description: String(formData.get("description") ?? "").trim(),
    urls,
    images,
    notes: String(formData.get("notes") ?? "").trim(),
    location: String(formData.get("location") ?? "").trim(),
    latitude,
    longitude,
    rating,
    visited: formData.get("visited") === "on",
    videoUrl,
    videoType,
  };
}

function parseTagNames(formData: FormData): string[] {
  return [
    ...new Set(
      formData
        .getAll("tags")
        .map((t) => String(t).trim())
        .filter(Boolean),
    ),
  ];
}

/** Set the acting user's tags on a bookmark to exactly `names` (upsert + prune). */
async function syncBookmarkTags(
  bookmarkId: string,
  userId: string,
  names: string[],
) {
  const tags = await Promise.all(
    names.map((name) =>
      prisma.tag.upsert({
        where: { userId_name: { userId, name } },
        create: { userId, name },
        update: {},
      }),
    ),
  );
  const tagIds = tags.map((t) => t.id);

  // Drop this user's tags that are no longer selected (leaves other users' tags).
  await prisma.bookmarkTag.deleteMany({
    where: { bookmarkId, tag: { userId }, NOT: { tagId: { in: tagIds } } },
  });

  if (tagIds.length) {
    await prisma.bookmarkTag.createMany({
      data: tagIds.map((tagId) => ({ bookmarkId, tagId })),
      skipDuplicates: true,
    });
  }
}

async function listIdOf(bookmarkId: string): Promise<string> {
  const bookmark = await prisma.bookmark.findUnique({
    where: { id: bookmarkId },
    select: { listId: true },
  });
  if (!bookmark) throw new Error("Bookmark not found.");
  return bookmark.listId;
}

export async function createBookmark(listId: string, formData: FormData) {
  const user = await requireUser();
  await assertRole(user.id, listId, "COLLABORATOR");

  const fields = parseBookmarkFields(formData);
  const bookmark = await prisma.bookmark.create({
    data: { ...fields, listId },
  });
  await syncBookmarkTags(bookmark.id, user.id, parseTagNames(formData));

  // Stay on the list so the create panel can close and the new card appears.
  revalidatePath(`/lists/${listId}`);
}

/**
 * Create the same bookmark independently in each target list — existing lists
 * (by id) plus any brand-new lists (created by name). Each list gets its own
 * bookmark row + tag links, so editing or deleting one copy never affects the
 * others. Used by the standalone /bookmarks/new flow.
 */
export async function createBookmarkInLists(
  existingListIds: string[],
  newListNames: string[],
  formData: FormData,
) {
  const user = await requireUser();

  const fields = parseBookmarkFields(formData);
  const tagNames = parseTagNames(formData);

  const existing = [...new Set(existingListIds.filter(Boolean))];
  const newNames = [
    ...new Set(newListNames.map((n) => n.trim()).filter(Boolean)),
  ];
  if (existing.length === 0 && newNames.length === 0) {
    throw new Error("Pick at least one list for the bookmark.");
  }

  // Must be allowed to add to each existing list.
  for (const listId of existing) {
    await assertRole(user.id, listId, "COLLABORATOR");
  }

  // Create any new lists (owned by the user), collecting their ids.
  const targetIds = [...existing];
  for (const name of newNames) {
    const list = await createListRecord(user.id, { name });
    targetIds.push(list.id);
  }

  // One independent bookmark row (+ its own tag links) per target list.
  for (const listId of targetIds) {
    const bookmark = await prisma.bookmark.create({
      data: { ...fields, listId },
    });
    await syncBookmarkTags(bookmark.id, user.id, tagNames);
  }

  revalidatePath("/");
  for (const listId of targetIds) revalidatePath(`/lists/${listId}`);
}

export async function updateBookmark(bookmarkId: string, formData: FormData) {
  const user = await requireUser();
  const listId = await listIdOf(bookmarkId);
  await assertRole(user.id, listId, "COLLABORATOR");

  const fields = parseBookmarkFields(formData);
  await prisma.bookmark.update({ where: { id: bookmarkId }, data: fields });
  await syncBookmarkTags(bookmarkId, user.id, parseTagNames(formData));

  revalidatePath(`/lists/${listId}`);
  revalidatePath(`/lists/${listId}/bookmarks/${bookmarkId}`);
}

export async function deleteBookmark(bookmarkId: string) {
  const user = await requireUser();
  const listId = await listIdOf(bookmarkId);
  await assertRole(user.id, listId, "COLLABORATOR");

  await prisma.bookmark.delete({ where: { id: bookmarkId } });

  revalidatePath(`/lists/${listId}`);
  redirect(`/lists/${listId}`);
}

/** Quick toggle of the visited flag from a card/detail. */
export async function toggleVisited(bookmarkId: string) {
  const user = await requireUser();
  const bookmark = await prisma.bookmark.findUnique({
    where: { id: bookmarkId },
    select: { listId: true, visited: true },
  });
  if (!bookmark) throw new Error("Bookmark not found.");
  await assertRole(user.id, bookmark.listId, "COLLABORATOR");

  await prisma.bookmark.update({
    where: { id: bookmarkId },
    data: { visited: !bookmark.visited },
  });

  revalidatePath(`/lists/${bookmark.listId}`);
  revalidatePath(`/lists/${bookmark.listId}/bookmarks/${bookmarkId}`);
}
