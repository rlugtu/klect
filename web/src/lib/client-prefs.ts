"use client";

import { useSyncExternalStore } from "react";

/**
 * Tiny browser-preference store for desktop UI state (panel collapsed, last
 * panel tab, list view). Values live in localStorage; every access is wrapped
 * in try/catch because storage can throw (Safari private mode, disabled
 * storage, quota). When it throws, an in-memory map keeps the preference for
 * the rest of the page session instead.
 *
 * Read through `usePref` (useSyncExternalStore) rather than useState plus a
 * mount effect: the server snapshot is null, so the first client render
 * matches the server HTML, and the stored value lands on the next render
 * without a set-state-in-effect.
 */

const memory = new Map<string, string>();
const listeners = new Set<() => void>();

export function readPref(key: string): string | null {
  try {
    const v = window.localStorage.getItem(key);
    if (v !== null) return v;
  } catch {
    // Fall through to the in-memory copy.
  }
  return memory.get(key) ?? null;
}

export function writePref(key: string, value: string) {
  memory.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: the in-memory copy above still applies.
  }
  for (const l of listeners) l();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The stored string for `key`, or null (always null during SSR and hydration). */
export function usePref(key: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => readPref(key),
    () => null,
  );
}

/** Tailwind's `lg` breakpoint, the line the desktop layout is drawn at. */
export const DESKTOP_QUERY = "(min-width: 1024px)";

function subscribeDesktop(onChange: () => void) {
  const mql = window.matchMedia(DESKTOP_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/** True at lg and up. False on the server and during hydration. */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  );
}

/** Imperative check for event handlers and effects. */
export function isDesktopViewport(): boolean {
  return typeof window !== "undefined" && window.matchMedia(DESKTOP_QUERY).matches;
}

/** True when a key event comes from a place where typing should win over shortcuts. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
