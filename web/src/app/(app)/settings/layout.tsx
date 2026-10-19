import { Suspense, type ReactNode } from "react";
import { SettingsNav, SettingsNavLinks } from "@/components/settings/SettingsNav";

/**
 * Settings at lg (1024px) and up: a section nav on the left, the section on
 * the right. Wraps /settings (whose `?section=` picks the section) and the
 * existing /settings/feedback and /settings/share-extension pages, which become
 * two of the sections without changing their URLs.
 *
 * Below lg the nav is display:none and the wrappers are plain blocks, so every
 * settings page renders as before.
 */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="lg:flex">
      <nav
        aria-label="Settings"
        className="set-nav hidden lg:sticky lg:top-14 lg:block lg:h-[calc(100dvh-3.5rem)] lg:w-56 lg:shrink-0 lg:overflow-y-auto lg:px-3 lg:py-8 xl:w-60"
      >
        <p className="font-pixel text-muted mb-3 px-2.5 text-xs">
          Settings
        </p>
        <Suspense fallback={<SettingsNavLinks active={null} />}>
          <SettingsNav />
        </Suspense>
      </nav>
      <div className="lg:min-w-0 lg:flex-1">{children}</div>
    </div>
  );
}
