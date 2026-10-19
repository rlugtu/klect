import Link from "next/link";
import type { ReactNode } from "react";
import { MessageSquarePlus } from "lucide-react";
import { PixelButton } from "@/components/ui/PixelButton";

/**
 * Right pane of the lg+ messages workspace when no conversation is open
 * (/friends and /friends/dms). display:none below lg, where those pages keep
 * their original single-column content.
 */
export function WorkspaceEmpty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="hidden h-full flex-col items-center justify-center gap-4 p-8 text-center lg:flex">
      <span
        aria-hidden
        className="shell-thumb-empty pixel-box-sm flex size-16 items-center justify-center text-3xl"
      >
        💬
      </span>
      <h1 className="text-primary text-xl font-bold">{title}</h1>
      <p className="text-muted max-w-sm text-sm">{children}</p>
      <Link href="/friends/dms/new">
        <PixelButton size="sm" tabIndex={-1}>
          <MessageSquarePlus size={14} aria-hidden /> New chat
        </PixelButton>
      </Link>
    </section>
  );
}
