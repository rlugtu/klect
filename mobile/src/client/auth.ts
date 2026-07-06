import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";

/** Base URL of the web app, which hosts the better-auth server + tRPC API. */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

/**
 * better-auth client for the native app — same auth server web uses, but with the
 * Expo plugin (tokens in expo-secure-store, deep-link `scheme` for OAuth). Web uses
 * better-auth/react against this same server.
 */
export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [
    expoClient({
      scheme: "saive",
      storagePrefix: "saive",
      storage: SecureStore,
    }),
  ],
});
