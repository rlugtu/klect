import { router, protectedProcedure } from "../trpc";
import { profileInput } from "../inputs";
import { saveProfile } from "@/lib/core/profile";

export const profileRouter = router({
  update: protectedProcedure
    .input(profileInput)
    .mutation(({ ctx, input }) => saveProfile(ctx.user.id, input)),
});
