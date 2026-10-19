/**
 * The lg+ settings sections, shared by the section nav (client) and the
 * settings page (server). Most are `?section=` views of /settings; Share
 * extension and Feedback are their existing pages, which render inside the
 * same settings layout.
 *
 * Below lg none of this is used: /settings stays the single stacked page and
 * ignores `?section=`.
 */
export const SETTINGS_SECTIONS = [
  { id: "profile", label: "Profile" },
  { id: "membership", label: "Membership" },
  { id: "appearance", label: "Appearance" },
  { id: "share-extension", label: "Share extension", href: "/settings/share-extension" },
  { id: "blocked", label: "Blocked users" },
  { id: "feedback", label: "Feedback", href: "/settings/feedback" },
  { id: "legal", label: "Privacy and terms" },
  { id: "account", label: "Account" },
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];

/** Sections that are views of /settings itself (the rest are their own pages). */
export type SettingsPageSection = Exclude<
  SettingsSectionId,
  "share-extension" | "feedback"
>;

const PAGE_SECTIONS: readonly string[] = SETTINGS_SECTIONS.filter(
  (s) => !("href" in s),
).map((s) => s.id);

/** Validate `?section=`; anything unknown falls back to Profile. */
export function parseSettingsSection(raw: unknown): SettingsPageSection {
  return typeof raw === "string" && PAGE_SECTIONS.includes(raw)
    ? (raw as SettingsPageSection)
    : "profile";
}

export function settingsSectionHref(id: SettingsSectionId): string {
  const s = SETTINGS_SECTIONS.find((x) => x.id === id);
  if (s && "href" in s) return s.href;
  return id === "profile" ? "/settings" : `/settings?section=${id}`;
}
