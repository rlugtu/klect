import { Suspense, type ReactNode } from "react";
import { getShellData, type ShellList } from "@/lib/shell";
import type { PaletteList } from "@/lib/commands";
import { Sidebar, SidebarSkeleton } from "./Sidebar";
import { TopBar } from "./TopBar";
import { CommandCenter } from "./CommandCenter";
import { DensitySync } from "./DensitySync";
import { SidebarSync } from "./SidebarSync";
import type { ShellUser } from "./UserAvatar";

/**
 * The desktop app shell for signed-in pages: persistent sidebar, sticky top bar,
 * and the page in a fluid content column.
 *
 * Additive by construction. Every shell surface is `hidden lg:flex`, and the two
 * wrappers around the page only take on layout at `lg:`. Below 1024px the
 * wrappers are plain blocks, so each page renders exactly as it did before the
 * shell existed (its own <main>, its own header and Back links).
 *
 * The document still scrolls (sidebar and top bar are sticky, not a fixed frame
 * with an inner scroller), so existing pages, anchors, and drawers that assume
 * window scroll keep working unchanged.
 *
 * Shell data streams behind Suspense: the frame and identity render from the
 * session immediately, and the counts and lists tree land when read.
 *
 * The root element carries the viewer's density (`data-density`, set before
 * paint by DensitySync, hence `suppressHydrationWarning`) and, when the viewer
 * collapsed the xl sidebar to the rail, `data-sidebar` (SidebarSync, same way),
 * and CommandCenter
 * adds the command palette, shortcuts sheet and global keys (lg+ only).
 */
export function AppShell({
  user,
  email,
  children,
}: {
  user: ShellUser;
  email: string;
  children: ReactNode;
}) {
  // Same cached read as the sidebar, so this costs nothing extra. Streamed to
  // the palette as a promise; it only waits on it when opened.
  const paletteLists: Promise<PaletteList[]> = getShellData(user.id, email)
    .then((d) => [
      ...d.ownedLists.map((l) => ({ ...pick(l), shared: false })),
      ...d.sharedLists.map((l) => ({ ...pick(l), shared: true })),
    ])
    .catch(() => []);

  return (
    <div id="app-shell" className="lg:flex lg:min-h-dvh" suppressHydrationWarning>
      <DensitySync userId={user.id} />
      <SidebarSync userId={user.id} />
      <CommandCenter userId={user.id} lists={paletteLists}>
        {/* display:none below lg, so it adds no tab stop to the mobile layout. */}
        <div className="hidden lg:block">
          <a
            href="#app-content"
            className="pixel-box-sm bg-panel text-ink sr-only px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
          >
            Skip to content
          </a>
        </div>
        <Suspense fallback={<SidebarSkeleton user={user} />}>
          <Sidebar user={user} email={email} />
        </Suspense>
        <div className="lg:flex lg:min-w-0 lg:flex-1 lg:flex-col">
          <TopBar user={user} email={email} />
          <div id="app-content" className="lg:flex-1">
            {children}
          </div>
        </div>
      </CommandCenter>
    </div>
  );
}

function pick(l: ShellList) {
  return {
    id: l.id,
    name: l.name,
    icon: l.icon,
    locked: l.locked,
    canAdd: l.role !== "VIEWER" && !l.locked,
  };
}
