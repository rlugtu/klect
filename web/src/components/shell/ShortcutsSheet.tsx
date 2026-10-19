"use client";

import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { BodyPortal } from "@/components/ui/BodyPortal";
import { settingsSectionHref } from "@/components/settings/sections";

type Row = { keys: string[]; label: string; single: boolean };

const SECTIONS: { title: string; rows: Row[] }[] = [
  {
    title: "Anywhere",
    rows: [
      { keys: ["Cmd/Ctrl", "K"], label: "Command palette", single: false },
      { keys: ["/"], label: "Search", single: true },
      { keys: ["C"], label: "New bookmark (in the current list when on one)", single: true },
      { keys: ["G", "H"], label: "Go to Home", single: true },
      { keys: ["G", "B"], label: "Go to All bookmarks", single: true },
      { keys: ["G", "N"], label: "Go to Near me", single: true },
      { keys: ["G", "M"], label: "Go to Messages", single: true },
      { keys: ["?"], label: "This list of shortcuts", single: true },
      { keys: ["Cmd/Ctrl", "V"], label: "Quick add a copied link (outside a field)", single: true },
      { keys: ["Cmd/Ctrl", "\\"], label: "Collapse or expand the sidebar", single: false },
      { keys: ["Alt", "↑ or ↓"], label: "Move the focused sidebar list up or down", single: false },
    ],
  },
  {
    title: "In a list",
    rows: [
      { keys: ["J"], label: "Next bookmark in the open panel", single: true },
      { keys: ["K"], label: "Previous bookmark in the open panel", single: true },
      { keys: ["→", "←"], label: "Next or previous bookmark in the open panel", single: false },
      { keys: ["Esc"], label: "Close the panel, then clear the selection", single: false },
      { keys: ["Cmd/Ctrl", "A"], label: "Select all (while a selection exists)", single: false },
    ],
  },
];

/**
 * The "?" sheet: every desktop shortcut, and whether single-key ones are on.
 * A modal dialog (portalled above the top bar) with focus held inside it; Esc
 * or the close button dismisses it and the caller restores focus.
 */
export function ShortcutsSheet({
  shortcutsOn,
  onClose,
}: {
  shortcutsOn: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  function onKeyDown(e: ReactKeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>("a[href], button");
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <BodyPortal>
      <div
        className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[10vh]"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="shortcuts-title"
          onKeyDown={onKeyDown}
          className="pixel-box bg-panel text-ink flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden"
        >
          <div className="border-border flex shrink-0 items-center justify-between gap-3 border-b px-5 py-3">
            <h2 id="shortcuts-title" className="text-primary text-base">
              Keyboard shortcuts
            </h2>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-muted hover:text-ink inline-flex size-8 cursor-pointer items-center justify-center"
            >
              <X size={18} aria-hidden />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <p className="text-muted mb-4 text-sm">
              Single-key shortcuts are{" "}
              <strong className="text-ink">{shortcutsOn ? "on" : "off"}</strong>. Turn
              them {shortcutsOn ? "off" : "on"} in{" "}
              <Link
                href={settingsSectionHref("appearance")}
                onClick={onClose}
                className="text-primary underline underline-offset-2"
              >
                Settings, Appearance
              </Link>
              . They never fire while you are typing in a field.
            </p>
            {SECTIONS.map((section) => (
              <section key={section.title} className="mb-4 last:mb-0">
                <h3 className="font-pixel text-muted mb-2 text-xs">
                  {section.title}
                </h3>
                <dl className="flex flex-col gap-1.5">
                  {section.rows.map((row) => (
                    <div
                      key={row.label}
                      className={
                        "flex items-center justify-between gap-4 text-sm" +
                        (row.single && !shortcutsOn ? " opacity-50" : "")
                      }
                    >
                      <dt>{row.label}</dt>
                      <dd className="flex shrink-0 items-center gap-1">
                        {row.keys.map((k, i) => (
                          <span key={k} className="flex items-center gap-1">
                            {i > 0 && (
                              <span className="text-muted text-xs">
                                {row.keys[0] === "G" ? "then" : row.keys[0] === "→" ? "or" : "+"}
                              </span>
                            )}
                            <kbd className="border-border text-muted rounded border px-1.5 text-xs">
                              {k}
                            </kbd>
                          </span>
                        ))}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </div>
      </div>
    </BodyPortal>
  );
}
