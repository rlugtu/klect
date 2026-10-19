"use client";

import { useEffect } from "react";
import {
  SHELL_ELEMENT_ID,
  densityBootScript,
  useDensity,
} from "@/lib/desktop-prefs";
import { InlineScript } from "@/components/ui/InlineScript";

/**
 * Applies the viewer's density (Settings, Appearance) to the app shell as
 * `data-density="compact"`; comfortable is the absence of the attribute.
 *
 * Two halves: an inline script that sets it while the HTML is parsed, so a full
 * page load paints compact from the first frame, and an effect that keeps it in
 * step afterwards (a change in Settings, another tab, or a client-side arrival
 * at the shell, where the inline script does not run). Must be rendered as the
 * shell element's first child, after its start tag.
 *
 * The CSS that reads the attribute is lg-only (globals.css), so below lg the
 * attribute changes nothing.
 */
export function DensitySync({ userId }: { userId: string }) {
  const density = useDensity(userId);

  useEffect(() => {
    const shell = document.getElementById(SHELL_ELEMENT_ID);
    if (!shell) return;
    if (density === "compact") shell.setAttribute("data-density", "compact");
    else shell.removeAttribute("data-density");
  }, [density]);

  return <InlineScript html={densityBootScript(userId)} />;
}
