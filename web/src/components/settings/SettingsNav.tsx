"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  SETTINGS_SECTIONS,
  parseSettingsSection,
  settingsSectionHref,
  type SettingsSectionId,
} from "@/components/settings/sections";

/**
 * Left section nav of the lg+ settings pane. A client component because the
 * active row comes from the URL (the settings layout does not re-render on
 * navigation). Rendered inside a display:none wrapper below lg.
 */
export function SettingsNav() {
  const pathname = usePathname();
  const params = useSearchParams();
  let active: SettingsSectionId | null = null;
  if (pathname === "/settings") active = parseSettingsSection(params.get("section"));
  else if (pathname.startsWith("/settings/share-extension")) active = "share-extension";
  else if (pathname.startsWith("/settings/feedback")) active = "feedback";
  return <SettingsNavLinks active={active} />;
}

/** The nav rows; `active` null highlights nothing (the Suspense fallback). */
export function SettingsNavLinks({ active }: { active: SettingsSectionId | null }) {
  return (
    <ul className="flex flex-col gap-1">
      {SETTINGS_SECTIONS.map((s) => {
        const on = s.id === active;
        return (
          <li key={s.id}>
            <Link
              href={settingsSectionHref(s.id)}
              aria-current={on ? "page" : undefined}
              className={cn(
                "shell-item flex min-h-10 items-center px-2.5 py-1.5",
                on
                  ? "bg-primary text-primary-ink"
                  : "text-ink/80 hover:bg-ink/5 hover:text-ink",
              )}
            >
              <span className="truncate">{s.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
