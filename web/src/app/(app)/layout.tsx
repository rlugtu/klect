import type { ReactNode } from "react";
import { getSession } from "@/lib/session";
import { AppShell } from "@/components/shell/AppShell";

/**
 * Layout for the signed-in app pages (this route group adds no URL segment, so
 * every path is unchanged). Auth, onboarding, legal, invite, and paywall pages
 * live outside the group and never get the shell.
 *
 * No shell without an onboarded session: `/` doubles as the public landing page
 * for signed-out visitors, and a session without a handle is mid-onboarding.
 * Access control stays where it was (each page's `requireOnboardedUser` and the
 * home page's redirects); this only decides whether to draw the frame.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  const user = session?.user;
  if (!user?.handle) return children;

  return (
    <AppShell
      user={{
        id: user.id,
        handle: user.handle,
        icon: user.icon ?? null,
      }}
      email={user.email}
    >
      {children}
    </AppShell>
  );
}
