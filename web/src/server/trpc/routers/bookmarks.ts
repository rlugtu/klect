import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { bookmarkInput } from "../inputs";
import { assertCanView } from "@/lib/permissions";
import {
  getBookmarksForList,
  getBookmarksByTags,
  getBookmarkForUser,
  getRecentBookmarksPage,
} from "@/lib/bookmarks";
import * as core from "@/lib/core/bookmarks";
import { BULK_BOOKMARK_MAX } from "@/lib/move-plan";

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

  /** Cross-list bookmarks, newest first, cursor-paginated. Powers mobile's Home "Recently
   * saved" strip and its Recent bookmarks page's infinite scroll. */
  recent: protectedProcedure
    .input(
      z
        .object({ cursor: z.string().optional(), limit: z.number().min(1).max(50).optional() })
        .optional(),
    )
    .query(({ ctx, input }) =>
      getRecentBookmarksPage(ctx.user.id, input?.cursor, input?.limit),
    ),

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

  /** Re-parent one bookmark into another list (keeps id, comments, tags). */
  move: protectedProcedure
    .input(z.object({ bookmarkId: z.string(), listId: z.string() }))
    .mutation(({ ctx, input }) =>
      core.moveBookmark(ctx.user.id, input.bookmarkId, input.listId),
    ),

  /** Bulk {@link move}: all or nothing, at most BULK_BOOKMARK_MAX ids. */
  moveMany: protectedProcedure
    .input(
      z.object({
        bookmarkIds: z.array(z.string()).min(1).max(BULK_BOOKMARK_MAX),
        listId: z.string(),
      }),
    )
    .mutation(({ ctx, input }) =>
      core.moveBookmarks(ctx.user.id, input.bookmarkIds, input.listId),
    ),

  /** Bulk delete: same per-item rules as `delete`, all or nothing. */
  deleteMany: protectedProcedure
    .input(
      z.object({ bookmarkIds: z.array(z.string()).min(1).max(BULK_BOOKMARK_MAX) }),
    )
    .mutation(({ ctx, input }) =>
      core.deleteBookmarks(ctx.user.id, input.bookmarkIds),
    ),

  /** Independent copies into another list (the `createInLists` write path). */
  copyMany: protectedProcedure
    .input(
      z.object({
        bookmarkIds: z.array(z.string()).min(1).max(BULK_BOOKMARK_MAX),
        listId: z.string(),
      }),
    )
    .mutation(({ ctx, input }) =>
      core.copyBookmarksToList(ctx.user.id, input.bookmarkIds, input.listId),
    ),

  /** Set (not toggle) the visited flag on several bookmarks, all or nothing. */
  setVisitedMany: protectedProcedure
    .input(
      z.object({
        bookmarkIds: z.array(z.string()).min(1).max(BULK_BOOKMARK_MAX),
        visited: z.boolean(),
      }),
    )
    .mutation(({ ctx, input }) =>
      core.setVisitedMany(ctx.user.id, input.bookmarkIds, input.visited),
    ),

  toggleVisited: protectedProcedure
    .input(z.object({ bookmarkId: z.string() }))
    .mutation(({ ctx, input }) =>
      core.toggleVisited(ctx.user.id, input.bookmarkId),
    ),

  setRating: protectedProcedure
    .input(
      z.object({
        bookmarkId: z.string(),
        rating: z.number().min(0).max(5).multipleOf(0.5),
      }),
    )
    .mutation(({ ctx, input }) =>
      core.setRating(ctx.user.id, input.bookmarkId, input.rating),
    ),
});
