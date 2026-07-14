import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { bookmarkInput } from "../inputs";
import { assertCanView } from "@/lib/permissions";
import {
  getBookmarksForList,
  getBookmarksByTags,
  getBookmarkForUser,
} from "@/lib/bookmarks";
import * as core from "@/lib/core/bookmarks";

export const bookmarksRouter = router({
  /** Bookmarks in a list — members (viewer+) or anyone if the list is public. */
  forList: protectedProcedure
    .input(z.object({ listId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertCanView(ctx.user.id, input.listId);
      return getBookmarksForList(input.listId);
    }),

  /** A single bookmark + the user's role, or null if no access. */
  get: protectedProcedure
    .input(z.object({ bookmarkId: z.string() }))
    .query(({ ctx, input }) => getBookmarkForUser(ctx.user.id, input.bookmarkId)),

  /** The user's bookmarks matching ANY of the given tags (OR). */
  byTags: protectedProcedure
    .input(z.object({ tagNames: z.array(z.string()) }))
    .query(({ ctx, input }) => getBookmarksByTags(ctx.user.id, input.tagNames)),

  create: protectedProcedure
    .input(z.object({ listId: z.string(), data: bookmarkInput }))
    .mutation(({ ctx, input }) =>
      core.createBookmark(ctx.user.id, input.listId, input.data),
    ),

  createInLists: protectedProcedure
    .input(
      z.object({
        existingListIds: z.array(z.string()),
        newListNames: z.array(z.string()),
        data: bookmarkInput,
        newListsPublic: z.boolean().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      core.createBookmarkInLists(
        ctx.user.id,
        input.existingListIds,
        input.newListNames,
        input.data,
        input.newListsPublic ?? false,
      ),
    ),

  update: protectedProcedure
    .input(z.object({ bookmarkId: z.string(), data: bookmarkInput }))
    .mutation(({ ctx, input }) =>
      core.updateBookmark(ctx.user.id, input.bookmarkId, input.data),
    ),

  delete: protectedProcedure
    .input(z.object({ bookmarkId: z.string() }))
    .mutation(({ ctx, input }) =>
      core.deleteBookmark(ctx.user.id, input.bookmarkId),
    ),

  toggleVisited: protectedProcedure
    .input(z.object({ bookmarkId: z.string() }))
    .mutation(({ ctx, input }) =>
      core.toggleVisited(ctx.user.id, input.bookmarkId),
    ),
});
