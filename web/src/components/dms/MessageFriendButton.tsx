"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { startConversation } from "@/lib/actions/dms";
import { toast } from "@/lib/toast";
import { atHandle } from "@/lib/handle";
import { PixelButton, type PixelButtonProps } from "@/components/ui/PixelButton";

/**
 * Opens (or resumes) the 1:1 conversation with a friend and jumps into it. Same
 * flow as NewChatList: `startConversation` enforces the friendship and block
 * rules on the server, so a stale button just toasts the refusal. Desktop only
 * today (the profile rail and the messages workspace).
 *
 * `iconOnly` keeps the accessible name ("Message @handle") on the button.
 */
export function MessageFriendButton({
  userId,
  handle,
  iconOnly = false,
  size = "sm",
  variant = "secondary",
}: {
  userId: string;
  handle: string | null;
  iconOnly?: boolean;
  size?: PixelButtonProps["size"];
  variant?: PixelButtonProps["variant"];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const name = `Message ${atHandle(handle)}`;

  async function open() {
    if (busy) return;
    setBusy(true);
    try {
      const { conversationId } = await startConversation(userId);
      router.push(`/friends/dms/${conversationId}`);
    } catch {
      // Thrown server action messages are redacted in production builds, so
      // a fixed message reads the same everywhere.
      toast.error("Couldn't open the chat. You can only message friends.");
      setBusy(false);
    }
  }

  return (
    <PixelButton
      type="button"
      size={size}
      variant={variant}
      onClick={open}
      disabled={busy}
      aria-label={iconOnly ? name : undefined}
      title={iconOnly ? name : undefined}
    >
      <MessageCircle size={14} aria-hidden />
      {!iconOnly && (busy ? "Opening…" : "Message")}
    </PixelButton>
  );
}
