import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { listInput } from "../inputs";
import { getUserLists, getListForUser } from "@/lib/lists";
import * as core from "@/lib/core/lists";

export const listsRouter = router({
  /** All lists the user participates in, in their personal order. */
  mine: protectedProcedure.query(({ ctx }) => getUserLists(ctx.user.id)),

  /** A single list + the user's membership, or null if no access. */
  get: protectedProcedure
    .input(z.object({ listId: z.string() }))
    .query(({ ctx, input }) => getListForUser(ctx.user.id, input.listId)),

  create: protectedProcedure
    .input(listInput)
    .mutation(({ ctx, input }) => core.createList(ctx.user.id, input)),

  update: protectedProcedure
    .input(z.object({ listId: z.string(), data: listInput }))
    .mutation(({ ctx, input }) =>
      core.updateList(ctx.user.id, input.listId, input.data),
    ),

  delete: protectedProcedure
    .input(z.object({ listId: z.string() }))
    .mutation(({ ctx, input }) => core.deleteList(ctx.user.id, input.listId)),

  reorder: protectedProcedure
    .input(z.object({ orderedListIds: z.array(z.string()) }))
    .mutation(({ ctx, input }) =>
      core.reorderLists(ctx.user.id, input.orderedListIds),
    ),
});
