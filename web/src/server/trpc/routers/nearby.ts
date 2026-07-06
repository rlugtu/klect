import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { findNearbyBookmarks } from "@/lib/core/nearby";

export const nearbyRouter = router({
  /** Geocoded bookmarks within `radiusMiles` of a point, closest first. */
  find: protectedProcedure
    .input(
      z.object({
        lat: z.number(),
        lon: z.number(),
        radiusMiles: z.number(),
        listIds: z.array(z.string()),
      }),
    )
    .query(({ ctx, input }) => findNearbyBookmarks(ctx.user.id, input)),
});
