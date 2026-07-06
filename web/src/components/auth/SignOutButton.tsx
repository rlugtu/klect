"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { PixelButton } from "@/components/ui/PixelButton";

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <PixelButton variant="danger" size="sm" onClick={handleSignOut}>
      Sign out
    </PixelButton>
  );
}
