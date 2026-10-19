"use client";

import type { ReactNode } from "react";
import { useIsDesktop } from "@/lib/client-prefs";

/**
 * Content that only exists below lg (1024px), for pages whose desktop layout
 * replaces a block with a different one.
 *
 * Server HTML and the hydration render always include the children (the server
 * cannot see the viewport, and the first client render must match it), hidden
 * at lg+ by CSS. Once hydrated on a desktop-width window the children unmount,
 * so client islands inside (realtime subscriptions, polling) stop running
 * where nobody can see them. Below lg nothing changes: the wrapper is
 * `display: contents`, so the children still lay out as direct children of
 * the parent (flex gaps and stretching included).
 */
export function MobileOnly({ children }: { children: ReactNode }) {
  const isDesktop = useIsDesktop();
  if (isDesktop) return null;
  return <div className="contents lg:hidden">{children}</div>;
}
