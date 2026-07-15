import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { inviteRole } from "../inputs";
import {
  getFriends,
  getIncomingFriendRequests,
  getOutgoingFriendRequests,
  getFriendListIds,
} from "@/lib/friends";
import * as core from "@/lib/core/friends";
import { addFriendToLists } from "@/lib/core/sharing";

export const friendsRouter = router({
  // Accepted friends + requests the user has received (incoming) and sent (outgoing).
  list: protectedProcedure.query(async ({ ctx }) => {
    const [friends, incoming, outgoing] = await Promise.all([
      getFriends(ctx.user.id),
      getIncomingFriendRequests(ctx.user.id),
      getOutgoingFriendRequests(ctx.user.id),
    ]);
    return { friends, incoming, outgoing };
  }),

  // Which of the given list ids the friend already belongs to (pre-select).
  friendListIds: protectedProcedure
    .input(z.object({ friendId: z.string(), listIds: z.array(z.string()) }))
    .query(({ input }) => getFriendListIds(input.friendId, input.listIds)),

  sendRequest: protectedProcedure
    .input(z.object({ handle: z.string() }))
    .mutation(({ ctx, input }) =>
      core.sendFriendRequest(ctx.user.id, input.handle),
    ),

  // Friend request straight to a user by id (from their profile page).
  requestByUser: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(({ ctx, input }) =>
      core.sendFriendRequestById(ctx.user.id, input.userId),
    ),

  accept: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) =>
      core.acceptFriendRequest(ctx.user.id, input.id),
    ),

  decline: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) =>
      core.declineFriendRequest(ctx.user.id, input.id),
    ),

  // Withdraw a pending request the current user sent.
  cancel: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) =>
      core.cancelFriendRequest(ctx.user.id, input.id),
    ),

  remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => core.removeFriend(ctx.user.id, input.id)),

  addToLists: protectedProcedure
    .input(
      z.object({
        friendId: z.string(),
        listIds: z.array(z.string()),
        role: inviteRole,
      }),
    )
    .mutation(({ ctx, input }) =>
      addFriendToLists(ctx.user.id, input.friendId, input.listIds, input.role),
    ),
});
