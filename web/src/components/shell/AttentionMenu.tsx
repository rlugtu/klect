"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; count: number };

/**
 * Bell in the top bar: a small disclosure listing what is waiting on the user,
 * built only from counts the shell already reads (list requests, friend
 * requests, unread messages). Not an activity feed; that needs a backend that
 * does not exist yet.
 */
export function AttentionMenu({
  listRequests,
  friendRequests,
  unreadMessages,
}: {
  listRequests: number;
  friendRequests: number;
  unreadMessages: number;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const items: Item[] = [
    { href: "/requests", label: "List requests", count: listRequests },
    { href: "/friends/requests", label: "Friend requests", count: friendRequests },
    { href: "/friends/dms", label: "Unread messages", count: unreadMessages },
  ];
  const total = listRequests + friendRequests + unreadMessages;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={total > 0 ? `Notifications, ${total} waiting` : "Notifications"}
        onClick={() => setOpen((o) => !o)}
        className="pixel-box-sm bg-panel text-ink relative flex size-9 cursor-pointer items-center justify-center"
      >
        <Bell size={16} aria-hidden />
        {total > 0 && (
          <span
            className="bg-accent border-panel absolute -top-1 -right-1 size-3 rounded-full border-2"
            aria-hidden
          />
        )}
      </button>
      {open && (
        <div
          id={panelId}
          className="pixel-box bg-panel absolute right-0 z-40 mt-2 w-64 p-2"
        >
          <p className="text-muted px-2 pt-1 pb-2 text-xs font-semibold">
            Needs your attention
          </p>
          <ul className="flex flex-col">
            {items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "hover:bg-ink/5 flex items-center justify-between gap-2 px-2 py-2 text-sm",
                    item.count === 0 && "text-muted",
                  )}
                >
                  {item.label}
                  <span
                    className={cn(
                      "min-w-5 rounded-full px-1.5 text-center text-xs leading-5 font-semibold",
                      item.count > 0 ? "bg-accent text-primary-ink" : "bg-ink/5",
                    )}
                  >
                    {item.count}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
