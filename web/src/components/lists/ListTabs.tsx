import Link from "next/link";
import { List, Vote, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type TabDef = {
  key: string;
  label: string;
  icon: LucideIcon;
  href: (listId: string) => string;
  /** Whether this tab is reachable for the current viewer. */
  show: (opts: { isMember: boolean }) => boolean;
};

/**
 * Rounded-pill segmented control for the single-list view — echoes the app's
 * nav styling. Both faces render on the same route: the List tab is the bare
 * list URL, the Polls tab adds `?tab=polls`, so the header/details/tabs stay
 * mounted and only the content below swaps. Add a future tab by appending one
 * entry here.
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
    href: (id) => `/lists/${id}?tab=polls`,
    // Polls require membership (the tab is hidden for public viewers).
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
  const tabs = TABS.filter((t) => t.show({ isMember }));
  if (tabs.length < 2) return null;

  return (
    <nav
      aria-label="List views"
      className="border-border bg-panel inline-flex items-center gap-1 self-start rounded-full border-2 p-1"
    >
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        const Icon = tab.icon;
        return (
          <Link
            key={tab.key}
            href={tab.href(listId)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm transition-colors",
              active
                ? "bg-primary text-primary-ink"
                : "text-muted hover:text-primary",
            )}
          >
            <Icon size={14} aria-hidden />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
