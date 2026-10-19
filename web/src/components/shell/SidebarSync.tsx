"use client";

import { useEffect } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import {
  SHELL_ELEMENT_ID,
  setSidebarCollapsed,
  sidebarBootScript,
  useSidebarCollapsed,
} from "@/lib/desktop-prefs";
import { InlineScript } from "@/components/ui/InlineScript";

/** The sidebar element's id, for the toggle's aria-controls. */
export const SIDEBAR_ID = "app-sidebar";

/** Tailwind's `xl`: the only width where the sidebar can be expanded at all. */
const XL_QUERY = "(min-width: 80rem)";

/**
 * Applies the viewer's collapsed-sidebar choice to the shell as
 * `data-sidebar="collapsed"` (expanded is the absence of the attribute), and
 * owns Cmd/Ctrl+\ to flip it.
 *
 * Same two halves as DensitySync: an inline script for the first paint of a
 * full load, then an effect that follows later changes (the toggle, the
 * shortcut, another tab). Must be a child of the shell element, after its
 * start tag. The CSS that reads the attribute is the `sbx:` variant, which
 * only exists at xl, so below xl the attribute changes nothing (lg is always
 * the rail, and below lg there is no sidebar).
 *
 * Cmd/Ctrl+\ is a modified key, so it is not covered by the single-key
 * shortcuts switch. It only acts at xl, where it has a visible effect.
 */
export function SidebarSync({ userId }: { userId: string }) {
  const collapsed = useSidebarCollapsed(userId);

  useEffect(() => {
    const shell = document.getElementById(SHELL_ELEMENT_ID);
    if (!shell) return;
    if (collapsed) shell.setAttribute("data-sidebar", "collapsed");
    else shell.removeAttribute("data-sidebar");
  }, [collapsed]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      if (e.key !== "\\" && e.code !== "Backslash") return;
      if (!window.matchMedia(XL_QUERY).matches) return;
      e.preventDefault();
      setSidebarCollapsed(userId, !collapsed);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [userId, collapsed]);

  return <InlineScript html={sidebarBootScript(userId)} />;
}

/**
 * The visible control for the same choice: shown at xl only (at lg the
 * sidebar is always the rail). Its label says what a press will do.
 */
export function SidebarToggle({ userId }: { userId: string }) {
  const collapsed = useSidebarCollapsed(userId);
  const label = collapsed ? "Expand sidebar" : "Collapse sidebar";
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <button
      type="button"
      onClick={() => setSidebarCollapsed(userId, !collapsed)}
      aria-controls={SIDEBAR_ID}
      aria-expanded={!collapsed}
      title={`${label} (Cmd/Ctrl+\\)`}
      className="shell-item text-muted hover:text-ink hover:bg-ink/5 hidden min-h-10 cursor-pointer items-center justify-center gap-3 px-2.5 py-1.5 xl:flex sbx:justify-start"
    >
      <span className="flex w-5 shrink-0 items-center justify-center">
        <Icon size={18} aria-hidden />
      </span>
      <span className="sr-only sbx:not-sr-only sbx:text-sm">{label}</span>
    </button>
  );
}
