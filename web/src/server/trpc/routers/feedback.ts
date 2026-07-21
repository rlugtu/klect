import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { submitFeedback } from "@/lib/core/feedback";

export const feedbackRouter = router({
  /** Store the signed-in user's app feedback. */
  submit: protectedProcedure
    .input(
      z.object({
        category: z.string(),
        message: z.string(),
        platform: z.string().optional(),
        appVersion: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) => submitFeedback(ctx.user.id, input)),
});
