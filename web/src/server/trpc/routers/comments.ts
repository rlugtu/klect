import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { assertRole } from "@/lib/permissions";
import { getListComments, getBookmarkComments } from "@/lib/comments";
import { getBookmarkForUser } from "@/lib/bookmarks";
import * as core from "@/lib/core/comments";

export const commentsRouter = router({
  forList: protectedProcedure
    .input(z.object({ listId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertRole(ctx.user.id, input.listId, "VIEWER");
      return getListComments(input.listId);
    }),

  forBookmark: protectedProcedure
    .input(z.object({ bookmarkId: z.string() }))
    .query(async ({ ctx, input }) => {
      const access = await getBookmarkForUser(ctx.user.id, input.bookmarkId);
      if (!access) throw new TRPCError({ code: "NOT_FOUND" });
      return getBookmarkComments(input.bookmarkId);
    }),

  addToList: protectedProcedure
    .input(z.object({ listId: z.string(), value: z.string() }))
    .mutation(({ ctx, input }) =>
      core.addListComment(ctx.user.id, input.listId, input.value),
    ),

  addToBookmark: protectedProcedure
    .input(z.object({ bookmarkId: z.string(), value: z.string() }))
    .mutation(({ ctx, input }) =>
      core.addBookmarkComment(ctx.user.id, input.bookmarkId, input.value),
    ),

  delete: protectedProcedure
    .input(z.object({ commentId: z.string() }))
    .mutation(({ ctx, input }) => core.deleteComment(ctx.user.id, input.commentId)),
});
