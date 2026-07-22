import "server-only";
import { prisma } from "@/lib/db";
import { type ReportTargetType } from "@/generated/prisma/enums";

/** Reasons a user can pick when reporting. Kept in sync with the mobile/web report sheets. */
export const REPORT_REASONS = [
  "spam",
  "harassment",
  "hate",
  "sexual",
  "violence",
  "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

const REPORT_TARGET_TYPES = [
  "USER",
  "COMMENT",
  "MESSAGE",
  "LIST_CHAT_MESSAGE",
] as const;

const MAX_NOTE_LENGTH = 2000;

/**
 * Block another user. Idempotent (unique on blockerId+blockedId). A "full block" also tears
 * down the interpersonal relationship in the same transaction: any friendship or pending
 * request between the two is deleted, so they immediately drop off each other's friends list
 * and can't DM (the DM gate also checks the block explicitly). Content-level hiding
 * (comments/chat/profile) is handled on the read side via `getBlockedUserIds`.
 */
export async function blockUser(userId: string, targetUserId: string) {
  if (userId === targetUserId) throw new Error("You can't block yourself.");
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true },
  });
  if (!target) throw new Error("User not found.");

  await prisma.$transaction([
    prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId: userId, blockedId: targetUserId } },
      update: {},
      create: { blockerId: userId, blockedId: targetUserId },
    }),
    prisma.friendship.deleteMany({
      where: {
        OR: [
          { requesterId: userId, addresseeId: targetUserId },
          { requesterId: targetUserId, addresseeId: userId },
        ],
      },
    }),
  ]);
}

/** Reverse a block. No-op if there was none. */
export async function unblockUser(userId: string, targetUserId: string) {
  await prisma.block.deleteMany({
    where: { blockerId: userId, blockedId: targetUserId },
  });
}

export type ReportInput = {
  targetType: string;
  targetId: string;
  reason: string;
  note?: string | null;
};

/** Resolve the authoring/owning user of a reported content item, for triage. */
async function resolveTargetUserId(
  targetType: ReportTargetType,
  targetId: string,
): Promise<string | null> {
  switch (targetType) {
    case "USER":
      return targetId;
    case "COMMENT": {
      const c = await prisma.comment.findUnique({
        where: { id: targetId },
        select: { authorId: true },
      });
      return c?.authorId ?? null;
    }
    case "MESSAGE": {
      const m = await prisma.message.findUnique({
        where: { id: targetId },
        select: { senderId: true },
      });
      return m?.senderId ?? null;
    }
    case "LIST_CHAT_MESSAGE": {
      const m = await prisma.listChatMessage.findUnique({
        where: { id: targetId },
        select: { senderId: true },
      });
      return m?.senderId ?? null;
    }
  }
}

/**
 * Store a user's report of objectionable content or an abusive user. Validates the target
 * type + reason against their allow-lists and caps the note. Reviewed by the operator (Prisma
 * Studio) and acted on within the window stated in /terms. Best-effort like feedback — never
 * duplicated between the web action and the tRPC procedure.
 */
export async function submitReport(userId: string, input: ReportInput) {
  const targetType = (REPORT_TARGET_TYPES as readonly string[]).includes(
    input.targetType,
  )
    ? (input.targetType as ReportTargetType)
    : null;
  if (!targetType) throw new Error("Invalid report target.");

  const targetId = (input.targetId ?? "").trim();
  if (!targetId) throw new Error("Nothing to report.");

  const reason = (REPORT_REASONS as readonly string[]).includes(input.reason)
    ? input.reason
    : "other";

  const note = input.note?.trim().slice(0, MAX_NOTE_LENGTH) || null;

  const targetUserId = await resolveTargetUserId(targetType, targetId);

  await prisma.report.create({
    data: { reporterId: userId, targetType, targetId, targetUserId, reason, note },
  });
}
