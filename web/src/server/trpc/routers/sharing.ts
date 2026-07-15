import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { inviteRole } from "../inputs";
import { assertRole } from "@/lib/permissions";
import {
  getListMembers,
  getPendingInvites,
  getIncomingRequests,
} from "@/lib/sharing";
import * as core from "@/lib/core/sharing";

export const sharingRouter = router({
  members: protectedProcedure
    .input(z.object({ listId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertRole(ctx.user.id, input.listId, "VIEWER");
      return getListMembers(input.listId);
    }),

  pendingInvites: protectedProcedure
    .input(z.object({ listId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertRole(ctx.user.id, input.listId, "OWNER");
      return getPendingInvites(input.listId);
    }),

  invite: protectedProcedure
    .input(
      z.object({
        listId: z.string(),
        handle: z.string(),
        role: inviteRole,
        alsoFriend: z.boolean().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      core.inviteToList(ctx.user.id, input.listId, {
        handle: input.handle,
        role: input.role,
        alsoFriend: input.alsoFriend,
      }),
    ),

  // Incoming list-join requests addressed to the current user (home page).
  incomingRequests: protectedProcedure.query(({ ctx }) =>
    getIncomingRequests(ctx.user.email),
  ),

  approveRequest: protectedProcedure
    .input(z.object({ inviteId: z.string() }))
    .mutation(({ ctx, input }) =>
      core.approveRequest(ctx.user.id, ctx.user.email, input.inviteId),
    ),

  rejectRequest: protectedProcedure
    .input(z.object({ inviteId: z.string() }))
    .mutation(({ ctx, input }) =>
      core.rejectRequest(ctx.user.email, input.inviteId),
    ),

  changeRole: protectedProcedure
    .input(
      z.object({ listId: z.string(), userId: z.string(), role: inviteRole }),
    )
    .mutation(({ ctx, input }) =>
      core.changeMemberRole(ctx.user.id, input.listId, input.userId, input.role),
    ),

  removeMember: protectedProcedure
    .input(z.object({ listId: z.string(), userId: z.string() }))
    .mutation(({ ctx, input }) =>
      core.removeMember(ctx.user.id, input.listId, input.userId),
    ),

  revokeInvite: protectedProcedure
    .input(z.object({ inviteId: z.string() }))
    .mutation(({ ctx, input }) =>
      core.revokeInvite(ctx.user.id, input.inviteId),
    ),

  leave: protectedProcedure
    .input(z.object({ listId: z.string() }))
    .mutation(({ ctx, input }) => core.leaveList(ctx.user.id, input.listId)),

  accept: protectedProcedure
    .input(z.object({ token: z.string() }))
    .mutation(({ ctx, input }) => core.acceptInvite(ctx.user.id, input.token)),
});
