"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

const noopSubscribe = () => () => {};

/**
 * Renders its children at the end of <body>, outside every stacking context
 * and transformed ancestor on the page. Used by overlays (sheets, drawers, the
 * command palette) so that `position: fixed` is relative to the viewport and
 * their z-index competes at the root, above the sticky desktop top bar and
 * sidebar (both z-30), instead of being trapped under them by a parent such as
 * the page-fade wrapper or the sticky list panel.
 *
 * Renders nothing on the server and during hydration (there is no body to
 * portal into yet); the children are mounted on the next client render.
 */
export function BodyPortal({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  return mounted ? createPortal(children, document.body) : null;
}
