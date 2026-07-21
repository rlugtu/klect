import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { getUserTags } from "@/lib/tags";
import { removeTagFromList } from "@/lib/core/tags";

export const tagsRouter = router({
  /** The user's tags with their assigned colors. */
  mine: protectedProcedure.query(({ ctx }) => getUserTags(ctx.user.id)),

  /** Remove a tag from every bookmark in a list (list-scoped) — COLLABORATOR+. */
  removeFromList: protectedProcedure
    .input(z.object({ listId: z.string(), name: z.string() }))
    .mutation(({ ctx, input }) =>
      removeTagFromList(ctx.user.id, input.listId, input.name),
    ),
});
