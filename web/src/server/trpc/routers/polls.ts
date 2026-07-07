import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { pollInput } from "../inputs";
import { assertRole } from "@/lib/permissions";
import { getListPolls, getPollForUser } from "@/lib/polls";
import * as core from "@/lib/core/polls";

export const pollsRouter = router({
  /** Polls in a list (viewer+). */
  forList: protectedProcedure
    .input(z.object({ listId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertRole(ctx.user.id, input.listId, "VIEWER");
      return getListPolls(input.listId);
    }),

  /** A single poll with options, votes, and the caller's context. */
  get: protectedProcedure
    .input(z.object({ pollId: z.string() }))
    .query(async ({ ctx, input }) => {
      const poll = await getPollForUser(ctx.user.id, input.pollId);
      if (!poll) throw new TRPCError({ code: "NOT_FOUND" });
      return poll;
    }),

  create: protectedProcedure
    .input(z.object({ listId: z.string(), data: pollInput }))
    .mutation(({ ctx, input }) =>
      core.createPoll(ctx.user.id, input.listId, input.data),
    ),

  update: protectedProcedure
    .input(z.object({ pollId: z.string(), data: pollInput }))
    .mutation(({ ctx, input }) =>
      core.updatePoll(ctx.user.id, input.pollId, input.data),
    ),

  delete: protectedProcedure
    .input(z.object({ pollId: z.string() }))
    .mutation(({ ctx, input }) => core.deletePoll(ctx.user.id, input.pollId)),

  submitVotes: protectedProcedure
    .input(z.object({ pollId: z.string(), optionIds: z.array(z.string()) }))
    .mutation(({ ctx, input }) =>
      core.submitVotes(ctx.user.id, input.pollId, input.optionIds),
    ),
});
