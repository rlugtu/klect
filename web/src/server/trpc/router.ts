import { router } from "./trpc";
import { listsRouter } from "./routers/lists";
import { bookmarksRouter } from "./routers/bookmarks";
import { commentsRouter } from "./routers/comments";
import { sharingRouter } from "./routers/sharing";
import { profileRouter } from "./routers/profile";
import { tagsRouter } from "./routers/tags";
import { nearbyRouter } from "./routers/nearby";
import {
  placesRouter,
  metadataRouter,
  comprehendRouter,
} from "./routers/external";

/**
 * The tRPC surface the mobile app consumes. Each procedure is a thin wrapper over
 * the same `@/lib/core` functions the web server actions use — logic is never
 * duplicated between the two transports. Mobile imports the `AppRouter` type only
 * (erased at compile time) for end-to-end type safety with no runtime coupling.
 */
export const appRouter = router({
  lists: listsRouter,
  bookmarks: bookmarksRouter,
  comments: commentsRouter,
  sharing: sharingRouter,
  profile: profileRouter,
  tags: tagsRouter,
  nearby: nearbyRouter,
  places: placesRouter,
  metadata: metadataRouter,
  comprehend: comprehendRouter,
});

export type AppRouter = typeof appRouter;
