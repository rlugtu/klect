import "server-only";
import { prisma } from "@/lib/db";
import { assertRole } from "@/lib/permissions";
import { createListRecord } from "@/lib/lists";

/**
 * Transport-agnostic list mutations. Each takes the acting `userId` plus already-
 * extracted input and does validation → `assertRole` → Prisma write, returning the
 * result. No FormData, no `revalidatePath`/`redirect`, no session lookup — those
 * belong to the caller (a web server action or a tRPC procedure), so both surfaces
 * share exactly this logic.
 */

export const LIST_NAME_MAX = 30;

export type ListInput = { name: string; description?: string; icon?: string };

/** Trim/clamp/validate raw list fields into what Prisma stores. */
export function normalizeListInput(input: ListInput) {
  const name = (input.name ?? "").trim().slice(0, LIST_NAME_MAX);
  if (!name) throw new Error("List name is required.");
  return {
    name,
    description: (input.description ?? "").trim(),
    icon: (input.icon ?? "").trim() || "📁",
  };
}

/** Create a list owned by the user; owner gets an OWNER membership. */
export function createList(userId: string, input: ListInput) {
  return createListRecord(userId, normalizeListInput(input));
}

/** Edit list metadata — requires COLLABORATOR or higher. */
export async function updateList(userId: string, listId: string, input: ListInput) {
  await assertRole(userId, listId, "COLLABORATOR");
  await prisma.list.update({
    where: { id: listId },
    data: normalizeListInput(input),
  });
}

/** Delete a list (cascades) — owner only. */
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
