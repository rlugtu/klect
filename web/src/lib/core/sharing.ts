import "server-only";
import { prisma } from "@/lib/db";
import { assertRole } from "@/lib/permissions";

export type InviteRole = "VIEWER" | "COLLABORATOR";
export type InviteState = { error?: string; success?: string };

/** Give a member the next position at the end of their personal ordering. */
function nextPosition(userId: string) {
  return prisma.listMembership.count({ where: { userId } });
}

/**
 * Owner invites someone by email. If that email already belongs to a user, they
 * become a member immediately; otherwise a pending invite waits for signup.
 * `actorEmail` is the inviting user's email (for the self-invite guard).
 */
export async function inviteToList(
  userId: string,
  actorEmail: string,
  listId: string,
  input: { email: string; role: InviteRole },
): Promise<InviteState> {
  await assertRole(userId, listId, "OWNER");

  const email = input.email.trim().toLowerCase();
  if (!email) return { error: "Email is required." };
  if (email === actorEmail.toLowerCase()) {
    return { error: "You already own this list." };
  }
  const role = input.role;

  await prisma.listInvite.upsert({
    where: { listId_email: { listId, email } },
    update: { role },
    create: { listId, email, role, invitedById: userId },
  });

  const invitee = await prisma.user.findUnique({ where: { email } });
  if (invitee) {
    const existing = await prisma.listMembership.findUnique({
      where: { listId_userId: { listId, userId: invitee.id } },
    });
    if (existing) {
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
    return { success: `Added ${email} to the list.` };
  }

  return { success: `Invite sent to ${email}. They'll join on signup.` };
}

/** Owner changes a member's role (viewer <-> collaborator). */
export async function changeMemberRole(
  userId: string,
  listId: string,
  targetUserId: string,
  role: InviteRole,
) {
  await assertRole(userId, listId, "OWNER");

  const target = await prisma.listMembership.findUnique({
    where: { listId_userId: { listId, userId: targetUserId } },
  });
  if (!target) throw new Error("Member not found.");
  if (target.role === "OWNER") throw new Error("Can't change the owner's role.");

  await prisma.listMembership.update({
    where: { listId_userId: { listId, userId: targetUserId } },
    data: { role },
  });
}

/** Owner removes a member from the list. */
export async function removeMember(
  userId: string,
  listId: string,
  targetUserId: string,
) {
  await assertRole(userId, listId, "OWNER");

  const target = await prisma.listMembership.findUnique({
    where: { listId_userId: { listId, userId: targetUserId } },
  });
  if (!target) return;
  if (target.role === "OWNER") throw new Error("Can't remove the owner.");

  await prisma.listMembership.delete({
    where: { listId_userId: { listId, userId: targetUserId } },
  });
}

/** Owner revokes a pending invite. Returns the affected list, or null. */
export async function revokeInvite(userId: string, inviteId: string) {
  const invite = await prisma.listInvite.findUnique({
    where: { id: inviteId },
    select: { listId: true },
  });
  if (!invite) return null;
  await assertRole(userId, invite.listId, "OWNER");

  await prisma.listInvite.delete({ where: { id: inviteId } });
  return { listId: invite.listId };
}

/**
 * A non-owner member leaves a shared list. No-op if they're not a member;
 * throws if they own it (owners delete instead).
 */
export async function leaveList(userId: string, listId: string) {
  const membership = await prisma.listMembership.findUnique({
    where: { listId_userId: { listId, userId } },
  });
  if (!membership) return;
  if (membership.role === "OWNER") {
    throw new Error("Owners can't leave — delete the list instead.");
  }

  await prisma.listMembership.delete({
    where: { listId_userId: { listId, userId } },
  });
}

/**
 * Accept an invite via its token link (any logged-in user with the link).
 * Returns the joined list, or null if the token is invalid.
 */
export async function acceptInvite(userId: string, token: string) {
  const invite = await prisma.listInvite.findUnique({ where: { token } });
  if (!invite) return null;

  const existing = await prisma.listMembership.findUnique({
    where: { listId_userId: { listId: invite.listId, userId } },
  });
  if (!existing) {
    await prisma.listMembership.create({
      data: {
        listId: invite.listId,
        userId,
        role: invite.role,
        position: await nextPosition(userId),
      },
    });
  }
  await prisma.listInvite.update({
    where: { id: invite.id },
    data: { status: "ACCEPTED" },
  });

  return { listId: invite.listId };
}
