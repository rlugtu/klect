import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { profileInput } from "../inputs";
import { saveProfile } from "@/lib/core/profile";
import { getPublicProfile } from "@/lib/profile";

export const profileRouter = router({
  update: protectedProcedure
    .input(profileInput)
    .mutation(({ ctx, input }) => saveProfile(ctx.user.id, input)),

  /** A user's public profile (identity + public lists + friend state). */
  get: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(({ ctx, input }) => getPublicProfile(ctx.user.id, input.userId)),
});
