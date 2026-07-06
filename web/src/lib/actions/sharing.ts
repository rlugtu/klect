"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { assertRole } from "@/lib/permissions";

type InviteRole = "VIEWER" | "COLLABORATOR";

function parseInviteRole(value: FormDataEntryValue | null): InviteRole {
  return value === "COLLABORATOR" ? "COLLABORATOR" : "VIEWER";
}

export type InviteState = { error?: string; success?: string };

/** Give a member the next position at the end of their personal ordering. */
async function nextPosition(userId: string) {
  return prisma.listMembership.count({ where: { userId } });
}

/**
 * Owner invites someone by email. If that email already belongs to a user, they
 * become a member immediately; otherwise a pending invite waits for signup.
 */
export async function inviteToList(
  listId: string,
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const user = await requireUser();
  await assertRole(user.id, listId, "OWNER");

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email) return { error: "Email is required." };
  if (email === user.email.toLowerCase()) {
    return { error: "You already own this list." };
  }
  const role = parseInviteRole(formData.get("role"));

  await prisma.listInvite.upsert({
    where: { listId_email: { listId, email } },
    update: { role },
    create: { listId, email, role, invitedById: user.id },
  });

  const invitee = await prisma.user.findUnique({ where: { email } });
  if (invitee) {
    const existing = await prisma.listMembership.findUnique({
      where: { listId_userId: { listId, userId: invitee.id } },
    });
    if (existing) {
      revalidatePath(`/lists/${listId}`);
      return { success: `${email} is already a member.` };
    }
    await prisma.listMembership.create({
      data: {
        listId,
        userId: invitee.id,
        role,
        position: await nextPosition(invitee.id),
      },
    });
    await prisma.listInvite.update({
      where: { listId_email: { listId, email } },
      data: { status: "ACCEPTED" },
    });
    revalidatePath(`/lists/${listId}`);
    return { success: `Added ${email} to the list.` };
  }

  revalidatePath(`/lists/${listId}`);
  return { success: `Invite sent to ${email}. They'll join on signup.` };
}

/** Owner changes a member's role (viewer <-> collaborator). */
export async function changeMemberRole(
  listId: string,
  userId: string,
  role: InviteRole,
) {
  const actor = await requireUser();
  await assertRole(actor.id, listId, "OWNER");

  const target = await prisma.listMembership.findUnique({
    where: { listId_userId: { listId, userId } },
  });
  if (!target) throw new Error("Member not found.");
  if (target.role === "OWNER") throw new Error("Can't change the owner's role.");

  await prisma.listMembership.update({
    where: { listId_userId: { listId, userId } },
    data: { role },
  });
  revalidatePath(`/lists/${listId}`);
}

/** Owner removes a member from the list. */
export async function removeMember(listId: string, userId: string) {
  const actor = await requireUser();
  await assertRole(actor.id, listId, "OWNER");

  const target = await prisma.listMembership.findUnique({
    where: { listId_userId: { listId, userId } },
  });
  if (!target) return;
  if (target.role === "OWNER") throw new Error("Can't remove the owner.");

  await prisma.listMembership.delete({
    where: { listId_userId: { listId, userId } },
  });
  revalidatePath(`/lists/${listId}`);
}

/** Owner revokes a pending invite. */
export async function revokeInvite(inviteId: string) {
  const actor = await requireUser();
  const invite = await prisma.listInvite.findUnique({
    where: { id: inviteId },
    select: { listId: true },
  });
  if (!invite) return;
  await assertRole(actor.id, invite.listId, "OWNER");

  await prisma.listInvite.delete({ where: { id: inviteId } });
  revalidatePath(`/lists/${invite.listId}`);
}

/** A non-owner member leaves a shared list. */
export async function leaveList(listId: string) {
  const user = await requireUser();
  const membership = await prisma.listMembership.findUnique({
    where: { listId_userId: { listId, userId: user.id } },
  });
  if (!membership) redirect("/");
  if (membership.role === "OWNER") {
    throw new Error("Owners can't leave — delete the list instead.");
  }

  await prisma.listMembership.delete({
    where: { listId_userId: { listId, userId: user.id } },
  });
  revalidatePath("/");
  redirect("/");
}

/** Accept an invite via its token link (any logged-in user with the link). */
export async function acceptInvite(token: string) {
  const user = await requireUser();
  const invite = await prisma.listInvite.findUnique({ where: { token } });
  if (!invite) redirect("/");

  const existing = await prisma.listMembership.findUnique({
    where: { listId_userId: { listId: invite.listId, userId: user.id } },
  });
  if (!existing) {
    await prisma.listMembership.create({
      data: {
        listId: invite.listId,
        userId: user.id,
        role: invite.role,
        position: await nextPosition(user.id),
      },
    });
  }
  await prisma.listInvite.update({
    where: { id: invite.id },
    data: { status: "ACCEPTED" },
  });

  revalidatePath("/");
  redirect(`/lists/${invite.listId}`);
}
