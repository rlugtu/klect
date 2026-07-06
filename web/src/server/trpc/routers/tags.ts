import { router, protectedProcedure } from "../trpc";
import { getUserTags } from "@/lib/tags";

export const tagsRouter = router({
  /** The user's tags with their assigned colors. */
  mine: protectedProcedure.query(({ ctx }) => getUserTags(ctx.user.id)),
});
