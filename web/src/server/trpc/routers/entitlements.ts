import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import * as core from "@/lib/core/active-selection";

/**
 * Free-tier capacity state and the downgrade-selection commits.
 *
 * `status` is the shared read behind both the selection screen and the paywalls;
 * the two mutations apply a selection. The caps and ownership are re-validated in
 * `core`, never here, so the web server action and this procedure enforce the same
 * rules. Structural validation only at this layer (see inputs.ts).
 */
export const entitlementsRouter = router({
  /** Is this account pro, what does it own, and is it over either cap right now. */
  status: protectedProcedure.query(({ ctx }) => core.getSelectionStatus(ctx.user.id)),

  /**
   * Keep exactly these lists active and lock the rest the user owns. Throws
   * `FreeLimitError` on an over-cap selection and a permission error on an id the
   * user does not own. No-op for pro users.
   */
  selectActiveLists: protectedProcedure
    .input(z.object({ listIds: z.array(z.string()) }))
    .mutation(({ ctx, input }) => core.selectActiveLists(ctx.user.id, input.listIds)),

  /**
   * Keep exactly these bookmarks active and lock the rest inside the user's active
   * lists. Bookmarks in a locked list are rejected, so call `selectActiveLists`
   * first. No-op for pro users.
   */
  selectActiveBookmarks: protectedProcedure
    .input(z.object({ bookmarkIds: z.array(z.string()) }))
    .mutation(({ ctx, input }) =>
      core.selectActiveBookmarks(ctx.user.id, input.bookmarkIds),
    ),
});
