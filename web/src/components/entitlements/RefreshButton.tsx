"use client";

import { useRouter } from "next/navigation";
import { PixelButton } from "@/components/ui/PixelButton";

/**
 * A `<Link href={currentPath}>` to the page you're already on is a no-op in
 * Next's client router (no URL change, nothing re-fetches). `router.refresh()`
 * re-runs the server component in place instead.
 */
export function RefreshButton() {
  const router = useRouter();
  return (
    <PixelButton size="sm" onClick={() => router.refresh()}>
      Refresh
    </PixelButton>
  );
}
