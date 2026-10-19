"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { isDesktopViewport, isTypingTarget } from "@/lib/client-prefs";
import { useShortcutsEnabled } from "@/lib/desktop-prefs";
import { NAV_TARGETS, newBookmarkHref, type PaletteList } from "@/lib/commands";
import { CommandPalette } from "./CommandPalette";
import { ShortcutsSheet } from "./ShortcutsSheet";
import { QuickAddDialog, pastedUrl } from "./QuickAddDialog";

type CommandCenterApi = {
  /** Open the palette, optionally with text already typed. lg+ only. */
  openPalette: (initialQuery?: string) => void;
  /**
   * True once right after the palette or sheet handed focus back to the top
   * bar search; its focus handler calls this so a restore does not reopen.
   */
  consumeRestoredFocus: () => boolean;
};

const CommandCtx = createContext<CommandCenterApi | null>(null);

/** The palette controls, or null outside the desktop shell. */
export function useCommandCenter() {
  return useContext(CommandCtx);
}

/** The element that has focus now, if it is one focus can return to. */
function focusedElement(): HTMLElement | null {
  const el = document.activeElement;
  return el instanceof HTMLElement && el !== document.body ? el : null;
}

/** How long the second key of a "g then x" sequence may wait. */
const SEQUENCE_MS = 1500;

/**
 * Desktop command surface for the app shell: the command palette, the
 * keyboard shortcuts sheet, and the global key handling behind both.
 *
 * Keys (all lg+ only, so phones and narrow windows get none of this):
 * - Cmd/Ctrl+K toggles the palette. Modified, so it is always on.
 * - Single-character keys, only while the viewer's "Keyboard shortcuts"
 *   setting is on (WCAG 2.1.4), never while typing in a field, never with
 *   Cmd/Ctrl/Alt held, and never while any dialog is open:
 *   `g` then `h`/`b`/`n`/`m` navigates, `c` starts a new bookmark (in the
 *   current list when on one), `/` opens search (the palette), `?` opens the
 *   shortcuts sheet.
 * - Paste (Cmd/Ctrl+V) with a single http(s) URL on the clipboard, while
 *   focus is not in a field and no dialog is open, opens Quick add with the
 *   link (QuickAddDialog). Covered by the same shortcuts switch, since it
 *   fires from page-level focus where a paste would otherwise do nothing.
 *   It listens for the `paste` event, so it never reads the clipboard itself.
 *
 * Focus: opening remembers the focused element and closing returns focus to
 * it, except when the palette navigated somewhere.
 */
export function CommandCenter({
  userId,
  lists,
  children,
}: {
  userId: string;
  lists: Promise<PaletteList[]>;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const shortcutsOn = useShortcutsEnabled(userId);

  // `session` remounts the palette with fresh state on every open.
  const [palette, setPalette] = useState<{ session: number; initial: string } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [quickAdd, setQuickAdd] = useState<{ session: number; url: string } | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const restoring = useRef(false);
  const goPressedAt = useRef(0);

  const restoreFocus = useCallback(() => {
    const el = returnFocus.current;
    returnFocus.current = null;
    if (!el || !el.isConnected) return;
    restoring.current = true;
    el.focus({ preventScroll: true });
    restoring.current = false;
  }, []);

  const openPalette = useCallback((initialQuery = "") => {
    if (!isDesktopViewport()) return;
    returnFocus.current = focusedElement();
    setSheetOpen(false);
    setPalette((p) => ({ session: (p?.session ?? 0) + 1, initial: initialQuery }));
  }, []);

  const closePalette = useCallback(
    (restore: boolean) => {
      setPalette(null);
      if (restore) restoreFocus();
      else returnFocus.current = null;
    },
    [restoreFocus],
  );

  const openSheet = useCallback((keepReturnFocus = false) => {
    if (!keepReturnFocus) returnFocus.current = focusedElement();
    setPalette(null);
    setSheetOpen(true);
  }, []);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    restoreFocus();
  }, [restoreFocus]);

  const closeQuickAdd = useCallback(() => {
    setQuickAdd(null);
    restoreFocus();
  }, [restoreFocus]);

  const consumeRestoredFocus = useCallback(() => restoring.current, []);

  useEffect(() => {
    if (!shortcutsOn) return;
    function onPaste(e: ClipboardEvent) {
      if (e.defaultPrevented || !isDesktopViewport()) return;
      if (isTypingTarget(e.target) || isTypingTarget(document.activeElement)) return;
      if (document.querySelector('[role="dialog"]')) return;
      const url = pastedUrl(e.clipboardData?.getData("text/plain") ?? "");
      if (!url) return;
      e.preventDefault();
      returnFocus.current = focusedElement();
      setPalette(null);
      setSheetOpen(false);
      setQuickAdd((q) => ({ session: (q?.session ?? 0) + 1, url }));
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [shortcutsOn]);

  const paletteOpen = palette !== null;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented) return;

      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        if (!isDesktopViewport()) return;
        e.preventDefault();
        if (paletteOpen) closePalette(true);
        else openPalette();
        return;
      }

      if (!shortcutsOn || e.metaKey || e.ctrlKey || e.altKey) return;
      if (!isDesktopViewport() || isTypingTarget(e.target)) return;
      if (document.querySelector('[role="dialog"]')) return;

      const key = e.key;
      const sequence = Date.now() - goPressedAt.current < SEQUENCE_MS;
      goPressedAt.current = 0;
      if (sequence) {
        const target = NAV_TARGETS.find((t) => t.go === key.toLowerCase());
        if (target) {
          e.preventDefault();
          router.push(target.href);
        }
        return;
      }

      if (key === "g") {
        goPressedAt.current = Date.now();
      } else if (key === "c") {
        e.preventDefault();
        router.push(newBookmarkHref(pathname));
      } else if (key === "/") {
        e.preventDefault();
        openPalette();
      } else if (key === "?") {
        e.preventDefault();
        openSheet();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [shortcutsOn, paletteOpen, openPalette, closePalette, openSheet, router, pathname]);

  return (
    <CommandCtx.Provider value={{ openPalette, consumeRestoredFocus }}>
      {children}
      {palette && (
        <CommandPalette
          key={palette.session}
          initialQuery={palette.initial}
          lists={lists}
          pathname={pathname}
          shortcutsOn={shortcutsOn}
          onClose={() => closePalette(true)}
          onNavigate={(href) => {
            closePalette(false);
            router.push(href);
          }}
          onShowShortcuts={() => openSheet(true)}
        />
      )}
      {sheetOpen && <ShortcutsSheet shortcutsOn={shortcutsOn} onClose={closeSheet} />}
      {quickAdd && (
        <QuickAddDialog
          key={quickAdd.session}
          url={quickAdd.url}
          userId={userId}
          pathname={pathname}
          lists={lists}
          onClose={closeQuickAdd}
        />
      )}
    </CommandCtx.Provider>
  );
}
