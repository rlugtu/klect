"use client";

import { usePref, writePref } from "@/lib/client-prefs";

/**
 * Per-viewer desktop display preferences: layout density and the
 * keyboard-shortcuts switch (Settings, Appearance), and whether the sidebar is
 * collapsed to the icon rail at xl (the sidebar's own toggle). Both live in this browser's
 * localStorage through `client-prefs` (try/catch with an in-memory fallback),
 * keyed by user id so two accounts on one browser keep their own choice.
 * Nothing here is stored on the server or synced to mobile.
 */

export type Density = "comfortable" | "compact";

export const densityKey = (userId: string) => `klect:density:${userId}`;
export const shortcutsKey = (userId: string) => `klect:shortcuts:${userId}`;
export const sidebarKey = (userId: string) => `klect:sidebar:${userId}`;

/** The id of the shell element that carries `data-density`. */
export const SHELL_ELEMENT_ID = "app-shell";

/** Stored density; anything unknown (or nothing) is the default, comfortable. */
export function useDensity(userId: string): Density {
  return usePref(densityKey(userId)) === "compact" ? "compact" : "comfortable";
}

export function setDensity(userId: string, density: Density) {
  writePref(densityKey(userId), density);
}

/**
 * Whether single-character shortcuts are on. Default on (the stored value is
 * only ever "off" to turn them off). Per WCAG 2.1.4 this switch covers
 * single-character keys only (g, c, /, ?, J, K); modified and non-character
 * keys (Cmd/Ctrl+K, Esc, arrows) keep working.
 */
export function useShortcutsEnabled(userId: string): boolean {
  return usePref(shortcutsKey(userId)) !== "off";
}

export function setShortcutsEnabled(userId: string, enabled: boolean) {
  writePref(shortcutsKey(userId), enabled ? "on" : "off");
}

/** Whether the viewer collapsed the xl sidebar to the icon rail. Default expanded. */
export function useSidebarCollapsed(userId: string): boolean {
  return usePref(sidebarKey(userId)) === "collapsed";
}

export function setSidebarCollapsed(userId: string, collapsed: boolean) {
  writePref(sidebarKey(userId), collapsed ? "collapsed" : "expanded");
}

/**
 * Same as {@link densityBootScript}, for the collapsed sidebar: sets
 * `data-sidebar="collapsed"` on the shell while the HTML parses, so a viewer
 * who collapsed it never sees the full sidebar flash first.
 */
export function sidebarBootScript(userId: string): string {
  const key = JSON.stringify(sidebarKey(userId)).replace(/</g, "\\u003c");
  const id = JSON.stringify(SHELL_ELEMENT_ID);
  return `(function(){try{if(localStorage.getItem(${key})==="collapsed"){var e=document.getElementById(${id});if(e)e.setAttribute("data-sidebar","collapsed")}}catch(_){}})()`;
}

/**
 * The inline script that applies a stored compact density to the shell while
 * the HTML is still parsing, so a compact viewer never sees a comfortable
 * frame first. It must run after the shell element's start tag (it is the
 * shell's first child). The key is JSON-encoded with `<` escaped, so it can
 * never close the script element.
 */
export function densityBootScript(userId: string): string {
  const key = JSON.stringify(densityKey(userId)).replace(/</g, "\\u003c");
  const id = JSON.stringify(SHELL_ELEMENT_ID);
  return `(function(){try{if(localStorage.getItem(${key})==="compact"){var e=document.getElementById(${id});if(e)e.setAttribute("data-density","compact")}}catch(_){}})()`;
}
