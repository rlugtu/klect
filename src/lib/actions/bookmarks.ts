"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { assertRole } from "@/lib/permissions";
import { isTrustedIframeUrl } from "@/lib/video";

type BookmarkFields = {
  name: string;
  description: string;
  urls: string[];
  images: string[];
  notes: string;
  location: string;
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
