# Klect — Journal Theme (design doc)

> The Journal theme is **shipped and is the default** family (light + dark), alongside Pixel and
> Modern. This doc is the visual-design reference for it; for app structure, navigation, and the
> full feature set see `ARCHITECTURE.md`.

## Mockups

| | |
|---|---|
| ![Home light](mockups/01-home-light.png) Home — light | ![Home dark](mockups/02-home-dark.png) Home — dark |
| ![List detail light](mockups/03-list-detail-light.png) List detail — light | ![List detail dark](mockups/04-list-detail-dark.png) List detail — dark |
| ![Tag bottom sheet](mockups/05-tag-bottom-sheet.png) Tag filter bottom sheet | |
| ![Bookmark detail light](mockups/06-bookmark-detail-light.png) Bookmark detail — light | ![Bookmark detail dark](mockups/07-bookmark-detail-dark.png) Bookmark detail — dark |


A warm, personal "scrapbook" theme for the mobile app (Expo + NativeWind), alongside
the Pixel and Modern themes — same token architecture (`THEME_TOKENS`, skin vars),
its own palette + type + component treatment. Ships light + dark, and is the default.

## Screens covered

- **Home / Lists** (`(tabs)/index.tsx`) — lists you own or belong to, search, ＋ List / ＋ Bookmark
- **List detail** (`lists/[id].tsx`) — bookmarks in a list, name search + tag-filter bottom sheet, comments
- **Bookmark detail** (`bookmarks/[id].tsx`) — hero photos, rating, tags, notes, location, comments
- **New / edit bookmark** (`bookmarks/new.tsx`, `bookmarks/edit.tsx`) — shared `BookmarkForm`:
  link autofill, location search, and (standalone flow) the multi-list picker
- **Nearby** (`(tabs)/nearby.tsx`) — compact rows (name, emphasized distance, list label, up
  to 3 tag pills), full-width evenly-spaced radius chips
- **Settings** (`(tabs)/settings.tsx`) — account, theme picker, sign out · **Login**, **Members**

## Color tokens — `JOURNAL_LIGHT` / `JOURNAL_DARK`

Drop-in additions to `THEME_TOKENS` in `mobile/src/theme/tokens.ts` — same 11 keys,
no new infra. Adds a third theme family alongside Pixel/Modern.

```ts
JOURNAL_LIGHT: {
  bg: '#f6efe4', panel: '#fffaf0', ink: '#2e2620', muted: '#8a7c6c',
  primary: '#b5502f', primaryInk: '#fff8f0', accent: '#c98a2c',
  danger: '#b23b3b', success: '#4f7a4a', warning: '#c98a2c', border: '#ded0ba',
},
JOURNAL_DARK: {
  bg: '#1c1712', panel: '#26201a', ink: '#f2e9dc', muted: '#a89787',
  primary: '#e08a5f', primaryInk: '#1c1712', accent: '#e0b25a',
  danger: '#e07a6b', success: '#7fae70', warning: '#e0b25a', border: '#3a3128',
},
```

`border-w`: 1px (thin, like Modern). `radius`: 20px / `radius-sm`: 12px — softer and
larger than Modern's 16px/8px, for a rounded, hand-placed paper feel. Existing
per-tag colors (`tag-colors.ts`) carry over unchanged.

## Typography

Fonts are **per-family** (theme-driven CSS vars in `src/theme/tokens.ts` → `font-serif`/`font-sans`
NativeWind classes). The **Modern** family uses **Geist** (sleek all-sans — titles *and* body). The
below describes the **Journal**/Pixel families:

- **Newsreader** (serif), weight 500–600 — list/bookmark names, screen titles.
  Italic weight for empty-state/annotation copy (e.g. `"No bookmarks yet — add your
  first find."`).
- **Work Sans**, weight 400–600 — everything functional/UI: body copy, descriptions,
  comments, buttons.

## Component patterns

- **Photo-forward list card** — Home lists & in-list bookmark feed: a landscape
  photo (first extracted image, or a warm tinted placeholder) with a slight white
  "print border," title in Newsreader below, tag pills + rating underneath.
- **Compact row** — Nearby & search results: small square thumbnail, name + list
  icon/name, distance or muted meta on the right. On Nearby the distance is emphasized
  (larger, bold) and up to 3 tag pills sit under the list label. No large photo,
  optimized for scanning many results.
- **Rating** — keep the 5-star glyph rating (`StarRating.tsx`/bookmark detail),
  recolor filled stars to `accent` gold instead of the old yellow/warning token.
- **Tag pills** — same per-tag colored pills, softened to fully-rounded
  (radius-sm 12px), lowercase label, no border — matches the Modern theme's
  existing `[data-theme^="modern"] .pixel-tag` treatment, ported to `JOURNAL_*`.
- **Comments** — left-aligned avatar-less rows, author name in Work Sans 600, warm
  hairline divider between entries, newest first (unchanged behavior).
- **Primary button** — filled `primary` terracotta, radius-sm, `primaryInk` label,
  Work Sans 600.

## List detail — search + tag filter

A **filter row** sits **on the page**, in the `FlatList` header content directly below
the Edit list / Members action row (clear of the **Add** button in the screen header —
the tag trigger and Add were previously adjacent in `headerRight` and hard to tell
apart). The row is a left-justified **search box** that fills the remaining width, with
a **"Tags ▾"** button on its right. Typing filters the feed by bookmark name
(case-insensitive substring); the button opens a bottom sheet with a checkable list of
every tag used in this list (multi-select, OR filter). The two filters combine with
**AND**. When the list has no tags the button is hidden and the search box spans the
full width. No count badge on the button.

Selected tags render as a pills row (✕ per pill) directly under the row, followed by a
**Clear all** control that appears whenever a tag is selected **or** the search box has
text and resets **both**. With nothing active the row collapses away entirely, so an
unfiltered list shows no reserved empty space.

**Implementation:** in `mobile/src/app/lists/[id].tsx`, `Stack.Screen`'s `headerRight`
holds only **Add**. In the `ListHeaderComponent`, a `flex-row` holds the `query`-backed
`TextInput` (`flex-1`) and the `availableTags`-gated "Tags ▾" `Pressable`. The
`shown` `useMemo` AND-combines the name substring with the existing `selected` Set /
`toggleTag` OR logic. The bottom sheet (`@gorhom/bottom-sheet`, idiomatic in Expo)
renders the same toggle-list, and the pills / Clear-all block renders when
`selected.size > 0 || query.trim() !== ''`; Clear all runs `setSelected(new Set())` +
`setQuery('')`.

## NativeWind implementation notes

- Add `JOURNAL_LIGHT`/`JOURNAL_DARK` to `ThemeName` + `THEME_TOKENS` in
  `mobile/src/theme/tokens.ts`, mirrored in web's `globals.css`
  (`data-theme="journal-light"` / `"journal-dark"`) and the settings/onboarding
  4→6-option theme picker (`THEME_OPTIONS` in `web/src/lib/theme.ts`).
- No new Tailwind utilities needed — same `bg-bg`/`text-ink`/`bg-primary`/
  `border-skin`/`rounded-skin` classes, just new CSS-var values via `themeVars()`.
- Load `Newsreader` via `expo-font`; fall back to system serif until loaded. Work
  Sans can replace the current default system sans app-wide for this theme, or stay
  system font if that's simpler to ship first.
- Photo-forward cards need a soft drop shadow, which `border-skin` alone doesn't
  give — add a small shared `cardShadow` style object (RN `shadow*`/`elevation`
  props) alongside the border-radius tokens, applied via `style=` since NativeWind
  shadow utilities are inconsistent cross-platform.
- Rebuild `ListCard`/list-page bookmark rows to show the first `images[]` entry
  (existing field, currently only shown on detail) — this is the single biggest
  visual lift for the new theme.

## Resolved decisions

- **Default theme** — Journal is the default family (following system light/dark until the user
  picks another in Settings); Pixel and Modern remain available.
- **Photo-less bookmarks** — `PhotoCard` renders a solid warm placeholder tile (not a compact-row
  fallback) in list view.
- **Fonts** — per-family, bundled via `@expo-google-fonts/*` and loaded (`expo-font`) before the
  splash hides: **Geist** (Modern), Newsreader + Work Sans (Journal/Pixel). Font family names are
  emitted as CSS vars per theme in `src/theme/tokens.ts` (`fontFor`) and consumed by
  `tailwind.config.js` `fontFamily` (same var mechanism as colors).
