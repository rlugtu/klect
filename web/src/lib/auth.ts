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
  databaseHooks: {
    user: {
      create: {
        // When a new user signs up, attach any pending list invites for their email.
        after: async (user) => {
          const invites = await prisma.listInvite.findMany({
            where: { email: user.email, status: "PENDING" },
          });
          for (const invite of invites) {
            const existing = await prisma.listMembership.findUnique({
              where: {
                listId_userId: { listId: invite.listId, userId: user.id },
              },
            });
            if (!existing) {
              const position = await prisma.listMembership.count({
                where: { userId: user.id },
              });
              await prisma.listMembership.create({
                data: {
                  listId: invite.listId,
                  userId: user.id,
                  role: invite.role,
                  position,
                },
              });
            }
            await prisma.listInvite.update({
              where: { id: invite.id },
              data: { status: "ACCEPTED" },
            });
          }
        },
      },
    },
  },
  // App profile fields collected at onboarding (see DESIGN.md §3).
  user: {
    additionalFields: {
      firstName: { type: "string", required: false, input: true },
      lastName: { type: "string", required: false, input: true },
      displayName: { type: "string", required: false, input: true },
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
