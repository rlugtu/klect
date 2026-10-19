"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Users, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { PixelBadge } from "@/components/ui/PixelBadge";
import { loadUnreadCount } from "@/lib/actions/dms";
import { subscribeDm, realtimeEnabled } from "@/lib/realtime/client";

/**
 * Tab switcher shared by the Friends list and the DMs inbox. Keeps a live unread count on the
 * Messages tab: subscribes to the user's realtime channel and polls as a fallback, so the
 * attention badge stays fresh on whichever tab you're viewing.
 */
export function FriendsTabs({
  active,
  myId,
  initialUnread,
}: {
  active: "friends" | "dms";
  myId: string;
  initialUnread: number;
}) {
  const [unread, setUnread] = useState(initialUnread);

  useEffect(() => {
    let alive = true;
    const refresh = () =>
      loadUnreadCount()
        .then((n) => alive && setUnread(n))
        .catch(() => {});
    const unsub = subscribeDm(`dm:user:${myId}`, refresh);
    const id = setInterval(refresh, realtimeEnabled() ? 20000 : 5000);
    return () => {
      alive = false;
      unsub();
      clearInterval(id);
    };
  }, [myId]);

  return (
    <nav className="border-border flex items-center gap-1 border-b-2">
      <Tab href="/friends" on={active === "friends"}>
        <Users size={14} aria-hidden /> Friends
      </Tab>
      <Tab href="/friends/dms" on={active === "dms"}>
        <MessageCircle size={14} aria-hidden /> Messages
        {unread > 0 && (
          <PixelBadge tone="accent" className="ml-1 px-1.5 py-0">
            {unread}
          </PixelBadge>
        )}
      </Tab>
    </nav>
  );
}

function Tab({
  href,
  on,
  children,
}: {
  href: string;
  on: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={cn(
        "font-pixel -mb-0.5 flex items-center gap-2 border-b-2 px-3 py-2 text-sm",
        on
          ? "border-primary text-primary"
          : "border-transparent text-muted hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}
