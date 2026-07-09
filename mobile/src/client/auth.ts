import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import { inferAdditionalFields } from "better-auth/client/plugins";
import * as SecureStore from "expo-secure-store";

/** Base URL of the web app, which hosts the better-auth server + tRPC API. */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

/**
 * better-auth client for the native app — same auth server web uses, but with the
 * Expo plugin (tokens in expo-secure-store, deep-link `scheme` for OAuth). Web uses
 * better-auth/react against this same server.
 *
 * `inferAdditionalFields` mirrors the `user.additionalFields` web declares in
 * `web/src/lib/auth.ts`, so the session user is typed with the profile fields —
 * notably `displayName`, which the root layout reads as the "onboarded" signal.
 * (Kept as an explicit schema rather than `inferAdditionalFields<typeof auth>()`:
 * the type-only cross-app inference collapses to `{}` here, so we restate the fields.)
 */
export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [
    inferAdditionalFields({
      user: {
        firstName: { type: "string", required: false },
        lastName: { type: "string", required: false },
        displayName: { type: "string", required: false },
        birthday: { type: "date", required: false },
        icon: { type: "string", required: false },
        theme: { type: "string", required: false },
      },
    }),
    expoClient({
      scheme: "klect",
      storagePrefix: "klect",
      storage: SecureStore,
    }),
  ],
});
