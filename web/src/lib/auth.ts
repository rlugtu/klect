import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { bearer } from "better-auth/plugins";
import { expo } from "@better-auth/expo";
import { prisma } from "@/lib/db";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  // Allow the native app's deep-link scheme as an OAuth redirect target so the
  // mobile Google flow (via @better-auth/expo) can return to the app.
  trustedOrigins: ["klect://"],
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  // No signup hook to auto-join invited users: list invites are now request-based, so
  // a new user's PENDING invites (keyed by their email) surface as "collab requests" on
  // their home page for them to approve — see core/sharing.ts approveRequest.
  // App profile fields collected at onboarding (see DESIGN.md §3).
  user: {
    additionalFields: {
      handle: { type: "string", required: false, input: true },
      firstName: { type: "string", required: false, input: true },
      lastName: { type: "string", required: false, input: true },
      birthday: { type: "date", required: false, input: true },
      icon: { type: "string", required: false, input: true },
      theme: {
        type: "string",
        required: false,
        input: true,
        defaultValue: "MODERN_LIGHT",
      },
    },
  },
  // expo() enables the @better-auth/expo native flow. bearer() lets the mobile app
  // authenticate the tRPC API with `Authorization: Bearer <sessionToken>` instead of a
  // cookie — iOS release builds swallow `Secure` Set-Cookie headers into the native cookie
  // store, so the cookie round-trip is unreliable in production (see mobile/src/client).
  // The bearer hook only fires when an Authorization header is present, so web's cookie flow
  // is untouched. nextCookies() must stay last so server actions can set auth cookies.
  plugins: [expo(), bearer(), nextCookies()],
});
