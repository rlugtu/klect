import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { getBlockedUsers } from "@/lib/blocks";
import { blockUser, unblockUser, submitReport } from "@/lib/core/moderation";

export const moderationRouter = router({
  /** Users the current user has blocked (for the Blocked-users management screen). */
  blockedList: protectedProcedure.query(({ ctx }) =>
    getBlockedUsers(ctx.user.id),
  ),

  /** Block another user (removes friendship + hides content both ways). */
  block: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(({ ctx, input }) => blockUser(ctx.user.id, input.userId)),

  /** Reverse a block. */
  unblock: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(({ ctx, input }) => unblockUser(ctx.user.id, input.userId)),

  /** Report an abusive user or a piece of objectionable content. */
  report: protectedProcedure
    .input(
      z.object({
        targetType: z.enum(["USER", "COMMENT", "MESSAGE", "LIST_CHAT_MESSAGE"]),
        targetId: z.string(),
        reason: z.string(),
        note: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) => submitReport(ctx.user.id, input)),
});
