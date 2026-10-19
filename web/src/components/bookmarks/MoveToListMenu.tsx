"use client";

import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A list a bookmark can be moved into: the viewer is a collaborator+ and it is not locked. */
export type MoveDestination = { id: string; name: string; icon: string };

/**
 * A small popover menu anchored by its parent (the parent is `relative`).
 * Focus moves to the first item on open; Up/Down/Home/End move between items;
 * Esc or a click outside closes and returns focus to `returnFocus`.
 */
export function Popover({
  label,
  onClose,
  returnFocus,
  align = "right",
  placement = "below",
  className,
  children,
}: {
  label: string;
  onClose: () => void;
  returnFocus?: () => HTMLElement | null;
  align?: "left" | "right";
  placement?: "below" | "above";
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const focusRef = useRef(returnFocus);
  useEffect(() => {
    closeRef.current = onClose;
    focusRef.current = returnFocus;
  });

  useEffect(() => {
    ref.current
      ?.querySelector<HTMLElement>("[role=menuitem]:not([disabled]), button:not([disabled])")
      ?.focus();
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) closeRef.current();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function onKeyDown(e: ReactKeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeRef.current();
      focusRef.current?.()?.focus();
      return;
    }
    const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(e.key)) return;
    const items = Array.from(
      ref.current?.querySelectorAll<HTMLElement>("[role=menuitem]:not([disabled])") ?? [],
    );
    if (items.length === 0) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? items.length - 1
          : (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  }

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "pixel-box bg-panel text-ink absolute z-40 flex w-60 flex-col p-1.5 text-sm normal-case",
        align === "right" ? "right-0" : "left-0",
        placement === "below" ? "top-full mt-1.5" : "bottom-full mb-1.5",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * The keyboard-reachable way to move (or copy) bookmarks: a menu of
 * destination lists. Lists in `excludeListIds` (the one the bookmarks already
 * live in) are left out. `verb` only changes the wording; the caller decides
 * what a pick does.
 */
export function MoveToListMenu({
  destinations,
  excludeListIds = [],
  count,
  onPick,
  onClose,
  returnFocus,
  align,
  placement,
  verb = "Move",
}: {
  verb?: "Move" | "Copy";
  destinations: MoveDestination[];
  excludeListIds?: string[];
  count: number;
  onPick: (dest: MoveDestination) => void;
  onClose: () => void;
  returnFocus?: () => HTMLElement | null;
  align?: "left" | "right";
  placement?: "below" | "above";
}) {
  const options = destinations.filter((d) => !excludeListIds.includes(d.id));
  return (
    <Popover
      label={`${verb} ${count === 1 ? "bookmark" : `${count} bookmarks`} to list`}
      onClose={onClose}
      returnFocus={returnFocus}
      align={align}
      placement={placement}
    >
      <p className="text-muted px-2 pt-1 pb-1.5 text-xs font-semibold">
        {verb} to list
      </p>
      {options.length === 0 ? (
        <p className="text-muted px-2 pb-2 text-sm">
          No other list you can edit. Create one or ask to be a collaborator.
        </p>
      ) : (
        <div className="flex max-h-72 flex-col overflow-y-auto">
          {options.map((d) => (
            <button
              key={d.id}
              type="button"
              role="menuitem"
              onClick={() => onPick(d)}
              className="hover:bg-primary/15 focus-visible:bg-primary/15 flex cursor-pointer items-center gap-2 px-2 py-1.5 text-left outline-none"
            >
              <span aria-hidden className="w-5 shrink-0 text-center">
                {d.icon}
              </span>
              <span className="truncate">{d.name}</span>
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}
