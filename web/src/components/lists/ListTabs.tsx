"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { List, Vote, type LucideIcon } from "lucide-react";

type TabDef = {
  key: string;
  label: string;
  icon: LucideIcon;
  href: (listId: string) => string;
  /** Whether this tab is reachable for the current viewer. */
  show: (opts: { isMember: boolean }) => boolean;
};

/**
 * Route-based tabs for the single-list view. Each tab is a link that highlights
 * by URL, so content stays server-rendered and the poll sub-routes keep working.
 * Add a future tab by appending one entry here (+ its route).
 */
const TABS: TabDef[] = [
  {
    key: "list",
    label: "List",
    icon: List,
    href: (id) => `/lists/${id}`,
    show: () => true,
  },
  {
    key: "polls",
    label: "Polls",
    icon: Vote,
    href: (id) => `/lists/${id}/polls`,
    // Polls require membership (the route 404s for public viewers).
    show: ({ isMember }) => isMember,
  },
];

export function ListTabs({
  listId,
  activeKey,
  isMember,
}: {
  listId: string;
  activeKey: string;
  isMember: boolean;
}) {
  const pathname = usePathname();
  const tabs = TABS.filter((t) => t.show({ isMember }));
  if (tabs.length < 2) return null;

  return (
    <nav
      aria-label="List views"
      className="border-border flex items-center gap-1 border-b-2"
    >
      {tabs.map((tab) => {
        const href = tab.href(listId);
        const active = tab.key === activeKey || pathname === href;
        const Icon = tab.icon;
        return (
          <Link
            key={tab.key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`-mb-0.5 flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors ${
              active
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-primary"
            }`}
          >
            <Icon size={14} aria-hidden />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
