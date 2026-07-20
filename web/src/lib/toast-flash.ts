/**
 * Flash-toast bridge for redirecting server actions.
 *
 * Actions that end in `redirect()` throw a control-flow signal, so the client
 * that awaited them never gets a chance to call `toast.*`. Instead the action
 * drops a short-lived, NON-httpOnly `flash` cookie just before redirecting; the
 * `<Toaster />` host reads it on mount (`consumeFlashToast`), shows the toast,
 * and clears the cookie. Non-redirecting actions don't need this — their client
 * caller toasts inline after `await`.
 */

import type { ToastInput, ToastType } from "@/lib/toast";

const COOKIE = "flash_toast";

type FlashPayload = { type: ToastType; message: string };

/**
 * Server-side: queue a toast to appear after a redirect. Call inside a
 * `"use server"` action immediately before `redirect(...)`.
 */
export async function setFlashToast(type: ToastType, message: string) {
  // Imported lazily so this module stays usable from client bundles (which only
  // pull in `consumeFlashToast`); `next/headers` is server-only.
  const { cookies } = await import("next/headers");
  const store = await cookies();
  store.set(COOKIE, JSON.stringify({ type, message } satisfies FlashPayload), {
    httpOnly: false,
    maxAge: 15,
    sameSite: "lax",
    path: "/",
  });
}

/**
 * Client-side: read + clear any pending flash toast. Returns the toast input to
 * show, or `null`. Safe to call on the server (returns null — no `document`).
 */
export function consumeFlashToast(): ToastInput | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${COOKIE}=`));
  if (!match) return null;

  // Clear it immediately so a refresh doesn't replay the toast.
  document.cookie = `${COOKIE}=; Max-Age=0; path=/`;

  try {
    const payload = JSON.parse(
      decodeURIComponent(match.slice(COOKIE.length + 1)),
    ) as FlashPayload;
    if (!payload?.message) return null;
    return { type: payload.type, message: payload.message };
  } catch {
    return null;
  }
}
