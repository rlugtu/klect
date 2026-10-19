"use client";

import Form from "next/form";
import { useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { useCommandCenter } from "./CommandCenter";

// Platform never changes during a session, so there is nothing to subscribe to.
const noopSubscribe = () => () => {};
const isMacSnapshot = () => /Mac|iPhone|iPad/.test(navigator.platform);
// Unknown on the server: render no shortcut hint rather than guess and mismatch.
const serverSnapshot = () => null;

/**
 * Top-bar search, the trigger for the command palette. Focusing it, clicking
 * it, or starting to type in it opens the palette (Cmd/Ctrl+K and `/` do the
 * same, see CommandCenter). When focus comes back here from a closing palette
 * it stays put instead of reopening.
 *
 * Underneath it is still the Phase 1 GET form into All bookmarks
 * (`/bookmarks?q=`), so without JavaScript it keeps working as a plain search
 * with a real URL.
 */
export function GlobalSearch() {
  const commands = useCommandCenter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isMac = useSyncExternalStore(noopSubscribe, isMacSnapshot, serverSnapshot);
  // Mirror the current query while on the results page, so the box reads true.
  const current = pathname === "/bookmarks" ? (searchParams.get("q") ?? "") : "";

  return (
    <Form
      action="/bookmarks"
      role="search"
      className="pixel-box-sm bg-bg text-muted focus-within:text-ink flex h-9 w-full max-w-xl items-center gap-2.5 px-3"
    >
      <Search size={16} aria-hidden className="shrink-0" />
      <input
        key={current}
        type="search"
        name="q"
        defaultValue={current}
        placeholder="Search or jump to…"
        aria-label="Search or jump to"
        aria-haspopup="dialog"
        autoComplete="off"
        onFocus={() => {
          if (commands?.consumeRestoredFocus()) return;
          commands?.openPalette();
        }}
        // A click on the field while it already has focus (after a restore)
        // fires no focus event, so it opens the palette here instead.
        onMouseDown={(e) => {
          if (document.activeElement === e.currentTarget) {
            e.preventDefault();
            commands?.openPalette();
          }
        }}
        onKeyDown={(e) => {
          if (!commands || e.metaKey || e.ctrlKey || e.altKey) return;
          if (e.key.length === 1 || e.key === "Enter" || e.key === "ArrowDown") {
            e.preventDefault();
            commands.openPalette(e.key.length === 1 ? e.key : "");
          }
        }}
        className="text-ink placeholder:text-muted min-w-0 flex-1 bg-transparent text-sm outline-none"
      />
      {isMac !== null && (
        <kbd
          className="border-border text-muted shrink-0 rounded border px-1.5 text-xs"
          aria-hidden
        >
          {isMac ? "⌘K" : "Ctrl K"}
        </kbd>
      )}
    </Form>
  );
}
