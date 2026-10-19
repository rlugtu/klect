import "server-only";
import { prisma } from "@/lib/db";
import { assertRole } from "@/lib/permissions";
import { createListRecord } from "@/lib/lists";
import { assertCanCreateList } from "@/lib/core/entitlements";

/**
 * Transport-agnostic list mutations. Each takes the acting `userId` plus already-
 * extracted input and does validation → `assertRole` → Prisma write, returning the
 * result. No FormData, no `revalidatePath`/`redirect`, no session lookup — those
 * belong to the caller (a web server action or a tRPC procedure), so both surfaces
 * share exactly this logic.
 */

export const LIST_NAME_MAX = 30;

/**
 * Thrown when a mutation targets a list or bookmark that is locked.
 *
 * Locked means read, export, and delete only: the row was preserved (never deleted
 * by us) after the owner went over the free cap on a lapsed subscription, and it
 * becomes writable again when they re-subscribe or trim back under the cap.
 *
 * Deleting a locked row is deliberately still allowed. The downgrade path gives a
 * lapsed over-cap user two ways out, resubscribe or trim their own data back under
 * the cap, and until the selection screen ships, deleting is the only trim-down path
 * they have. Owners can always remove their own content. Locked means "cannot add to
 * or modify", never "cannot remove".
 *
 * Shaped exactly like `FreeLimitError` in core/entitlements.ts, deliberately: an
 * `Error` subclass carrying a machine-readable field plus an `instanceof` narrowing
 * helper, so every transport still surfaces `.message` unchanged while the UI can
 * branch on the cause without matching on copy. Locking is a free-tier concept, so
 * this belongs beside `FreeLimitError`; it lives here only because that file is
 * owned by another slice in flight. Move it there during the full locked-item audit
 * that follows the downgrade-selection flow.
 */
export class LockedError extends Error {
  /** Which kind of row is locked, so the UI can show the right unlock copy. */
  readonly kind: "list" | "bookmark";

  constructor(kind: "list" | "bookmark") {
    super(
      kind === "list"
        ? "This list is locked. Upgrade or free up space to edit it."
        : "This bookmark is locked. Upgrade or free up space to edit it.",
    );
    this.name = "LockedError";
    this.kind = kind;
  }
}

/** Narrow an unknown caught value to a {@link LockedError}. */
export function isLockedError(e: unknown): e is LockedError {
  return e instanceof LockedError;
}

/**
 * Throw a {@link LockedError} if this list is locked. Call this from edit-style
 * mutations only — deletes must stay available on locked rows (see {@link LockedError}).
 */
export async function assertListUnlocked(listId: string) {
  const list = await prisma.list.findUnique({
    where: { id: listId },
    select: { lockedAt: true },
  });
  if (!list) throw new Error("List not found.");
  if (list.lockedAt) throw new LockedError("list");
}

export type ListInput = {
  name: string;
  description?: string;
  icon?: string;
  isPublic?: boolean;
};

/** Trim/clamp/validate raw list fields into what Prisma stores. */
export function normalizeListInput(input: ListInput) {
  const name = (input.name ?? "").trim().slice(0, LIST_NAME_MAX);
  if (!name) throw new Error("List name is required.");
  return {
    name,
    description: (input.description ?? "").trim(),
    icon: (input.icon ?? "").trim() || "📁",
    isPublic: input.isPublic ?? false,
  };
}

/**
 * Create a list owned by the user; owner gets an OWNER membership. Refused once a
 * free account is at its owned-list cap (pro is unlimited). The check lives here in
 * core so the server action and the tRPC procedure are gated identically, whatever
 * the UI already did or did not hide.
 */
export async function createList(userId: string, input: ListInput) {
  const fields = normalizeListInput(input);
  await assertCanCreateList(userId);
  return createListRecord(userId, fields);
}

/** Toggle a list's public/private visibility — owner only. */
export async function setListVisibility(
  userId: string,
  listId: string,
  isPublic: boolean,
) {
  await assertRole(userId, listId, "OWNER");
  await prisma.list.update({ where: { id: listId }, data: { isPublic } });
}

/**
 * Edit list metadata — requires COLLABORATOR or higher. Visibility is NOT edited
 * here (it's an owner-only decision via {@link setListVisibility}), so `isPublic`
 * in the input is ignored.
 */
export async function updateList(userId: string, listId: string, input: ListInput) {
  await assertRole(userId, listId, "COLLABORATOR");
  await assertListUnlocked(listId);
  const { name, description, icon } = normalizeListInput(input);
  await prisma.list.update({
    where: { id: listId },
    data: { name, description, icon },
  });
}

/**
 * Delete a list (cascades) — owner only.
 *
 * Deliberately not gated on {@link assertListUnlocked}: an owner can delete a locked
 * list, because deleting is how an over-cap user trims back under the free cap
 * without resubscribing.
 */
export async function deleteList(userId: string, listId: string) {
  await assertRole(userId, listId, "OWNER");
  await prisma.list.delete({ where: { id: listId } });
}

/** Persist the user's personal list order (from drag-reorder). */
export async function reorderLists(userId: string, orderedListIds: string[]) {
  await prisma.$transaction(
    orderedListIds.map((listId, index) =>
      prisma.listMembership.updateMany({
        where: { listId, userId },
        data: { position: index },
      }),
    ),
  );
}
