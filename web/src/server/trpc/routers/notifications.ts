import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import {
  registerDeviceToken,
  unregisterDeviceToken,
  getNotificationPreferences,
  updateNotificationPreferences,
  computeBadgeCount,
} from "@/lib/core/notifications";

/**
 * Device push registration, per-category preferences, and the app-icon badge count.
 * Consumed by the mobile app only (web has no device push). Kept in sync with the
 * DESIGN.md API contract.
 */
export const notificationsRouter = router({
  // Register (or refresh) this device's Expo push token for the current user.
  registerDevice: protectedProcedure
    .input(
      z.object({
        token: z.string(),
        platform: z.enum(["ios", "android"]),
      }),
    )
    .mutation(({ ctx, input }) =>
      registerDeviceToken(ctx.user.id, input.token, input.platform),
    ),

  // Drop a device token (sign-out / push disabled).
  unregisterDevice: protectedProcedure
    .input(z.object({ token: z.string() }))
    .mutation(({ input }) => unregisterDeviceToken(input.token)),

  // The current user's per-category push preferences (defaults all-on).
  getPreferences: protectedProcedure.query(({ ctx }) =>
    getNotificationPreferences(ctx.user.id),
  ),

  // Update a subset of the current user's push preferences; returns the full set.
  updatePreferences: protectedProcedure
    .input(
      z.object({
        directMessages: z.boolean().optional(),
        listChat: z.boolean().optional(),
        friends: z.boolean().optional(),
        lists: z.boolean().optional(),
        comments: z.boolean().optional(),
        polls: z.boolean().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      updateNotificationPreferences(ctx.user.id, input),
    ),

  // The current user's app-icon badge count (unread DMs + friend requests + list invites).
  badgeCount: protectedProcedure.query(({ ctx }) =>
    computeBadgeCount(ctx.user.id),
  ),
});
