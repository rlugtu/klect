import { router } from "./trpc";
import { listsRouter } from "./routers/lists";
import { bookmarksRouter } from "./routers/bookmarks";
import { commentsRouter } from "./routers/comments";
import { pollsRouter } from "./routers/polls";
import { sharingRouter } from "./routers/sharing";
import { friendsRouter } from "./routers/friends";
import { dmsRouter } from "./routers/dms";
import { listChatRouter } from "./routers/list-chat";
import { profileRouter } from "./routers/profile";
import { accountRouter } from "./routers/account";
import { tagsRouter } from "./routers/tags";
import { nearbyRouter } from "./routers/nearby";
import { notificationsRouter } from "./routers/notifications";
import { feedbackRouter } from "./routers/feedback";
import { moderationRouter } from "./routers/moderation";
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
  polls: pollsRouter,
  sharing: sharingRouter,
  friends: friendsRouter,
  dms: dmsRouter,
  listChat: listChatRouter,
  profile: profileRouter,
  account: accountRouter,
  tags: tagsRouter,
  nearby: nearbyRouter,
  notifications: notificationsRouter,
  feedback: feedbackRouter,
  moderation: moderationRouter,
  places: placesRouter,
  metadata: metadataRouter,
  comprehend: comprehendRouter,
});

export type AppRouter = typeof appRouter;
