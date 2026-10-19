# Klect web: desktop UX strategy

Status: draft for Ryan's review. Scope: the desktop web app only. Mobile (Expo) is out of scope. Mobile and tablet web layouts must not change. No source code was touched; this doc is the only output.
Date: 2026-10-19.

---

## 1. What is wrong today (audit)

The root cause is structural, not cosmetic: **there is no app shell.** `src/app/layout.tsx` renders `{children}` plus the Toaster. Every page builds its own `<main className="mx-auto max-w-3xl px-6 py-12">` and its own header with a "Back" or "Home" button. `max-w-3xl` (768px) appears on 17 pages, `max-w-lg`/`max-w-md`/`max-w-2xl` on most of the rest. On a 1440px monitor that leaves about 330px of dead canvas on each side. There is also zero responsive styling beyond `sm:` (a single `sm:grid-cols-2`); nothing uses `md:`, `lg:` or `xl:`. And `template.tsx` re-mounts and fades every route, so even navigating between sibling pages feels like loading a new site.

Per screen:

| Screen | Problem on desktop |
|---|---|
| Home (`/`) | Header is a row of five secondary buttons (Bookmark, Near me, Friends, Profile, plus a separate "List requests" row). That is a nav bar disguised as page content. Lists render as one full-width stacked row each, so a user with 12 lists scrolls a long thin column. Search lives under the buttons. No view of recent bookmarks at all; you only see bookmarks after opening a list or filtering by tag. |
| List detail | One column. Bookmarks, then comments, stacked. Members and Polls are tabs that replace the content, so you cannot read comments while scanning bookmarks. Group chat is a 70vh slide-up drawer (a mobile bottom-sheet pattern) that covers the list. Bookmark cards are `grid sm:grid-cols-2` inside 768px, so max 2 columns. |
| Bookmark detail | Always a full page, 672px wide. Opening a bookmark loses the list context and scroll position; "Back" relies on history. Photos, notes, comments, share all stack in one narrow column while 600px+ sits empty on each side. |
| Near me | A radius dropdown, chips and a result list. Docs confirm "no in-app map" on web, while mobile has a full-screen map with drawer. On a big screen, a map is the single most obvious missing thing. |
| Friends / Messages | Friends, Requests, Pending and Messages are four separate routes with a tab strip plus two header buttons. DM inbox and DM thread are separate pages (thread is `h-[100dvh] max-w-3xl`). Desktop users expect the Slack/iMessage layout: conversation list left, thread right. |
| Requests | A standalone page for what is usually 0 to 3 items. Should be a badge and a popover, not a route. |
| Settings | Eight stacked cards in a 512px column. Profile, Membership, iOS share, Feedback, Blocked, Privacy, Account, Delete. Nothing is skippable; users must scroll past everything to find one. |
| Profile | Centered single column, avatar plus 2 stats plus a 2-col grid of public lists. Works, but wastes the width and has no content beyond lists. |
| Everywhere | "Back" and "Home" buttons on each page substitute for navigation. Settings is only reachable via your own profile page (a gear on `/users/[handle]`). Three clicks to leave a list for another list. |

What is **good** and must be kept: the token system, the three skins, real URLs per resource, server-first data loading, the list tab model (`?tab=`), and the existing component vocabulary (`PixelCard`, `PixelButton`, `PixelBadge`, `BookmarkCard`, `ListCard`).

---

## 2. Desktop user goals

Ranked by how often a desktop user is likely to do them (inferred from product shape; no analytics were available, see Open Decision 5 on getting some):

1. **Capture**: paste a link, get it into a list fast. Desktop users have a browser open; this is the highest-frequency task. (A Chrome extension already exists, so the web app is more often the place to *work with* saved things than to capture them.)
2. **Retrieve**: find something I saved. By list, by tag, by name, across everything.
3. **Triage and organize**: move, tag, rate, mark visited, reorder, many at a time. This is where mouse and keyboard beat a phone by a large margin.
4. **Collaborate**: see what friends added, comment, vote, chat, all while still looking at the list.
5. **Plan with location**: Near me, and in a bigger sense "what have I saved in this city".
6. **Manage account**: rarely, but needs to feel trustworthy (Pro, blocked users, delete account).

Design implication: desktop should optimize for **staying in place** (no page loads to see detail, comments, or chat) and **doing many things quickly** (keyboard, selection, drag).

---

## 3. Research summary (what matters for Klect)

Sources are named inline; search results were partly secondary, so where a claim is from a third-party summary it is marked.

- **Persistent sidebar for top-level areas, kept shallow.** Apple's HIG says a sidebar lists top-level areas and collections, shows no more than two levels, and should not be hidden by default; for deeper hierarchies add a content list between sidebar and detail (a three-pane split view). Klect's hierarchy is Library > List > Bookmark, which is exactly that shape. (Apple Human Interface Guidelines: Sidebars, Split views.)
- **Keep navigation on one side of a split.** Master-detail guidance (Oracle pattern library, Creo PageSplit docs) says keep the selected item visibly highlighted in the list pane, and do not put navigation in both panes. So the bookmark panel must not carry its own tab/nav system competing with the list.
- **View modes and hover-select are table stakes for bookmark managers.** Raindrop.io offers multiple view modes (list, grid, headlines, masonry per its help and third-party docs) switched from a top-right control, and selects items by hovering until a tick appears at the item's corner, then bulk-acting from a top bar. Adopt: view switcher, hover checkbox, bulk action bar.
- **Command palette plus discoverable shortcuts.** Linear, Superhuman and Slack all use Cmd+K as a global action/search surface; the guidance (Superhuman, Retool, third-party Linear design guides) is: shortcuts are shown in tooltips and in palette results so users learn them passively, and the palette should hold the actions that do not deserve a button. Adopt as a second-phase feature, not a first-phase dependency.
- **Side peek over full page for detail.** Sheets/slide-overs for contextual detail keep users in flow; split views for detail-alongside-list (UX Movement newsletter and a Linear design write-up; both secondary). Notion's "side peek" is the well-known example. Caveat: I could not retrieve Notion/Linear primary docs, so treat the pattern as common practice, not a spec.
- **Grid with drag-to-reorder from a handle.** Are.na's channel grid keeps the title under the thumbnail and lets you reorder by dragging from a block's top-left corner. Klect already has drag reorder for lists (`HomeLists`, framer-motion `Reorder`); extend the same affordance, keep it handle-based so clicking still opens.
- **Chat as a docked pane.** Slack and Discord keep the channel list and the conversation visible together; the conversation is never a modal. For Klect, per-list chat is secondary to the list itself, so a dockable right panel (not a full page) is the right weight.
- **Accessibility constraints for keyboard-heavy UI.** WCAG 2.1.4 (Character Key Shortcuts, Level A) requires that single-character shortcuts can be turned off, remapped, or are active only on focus. WCAG 1.4.10 (Reflow) means the desktop layout must collapse to one column at 320 CSS px with no two-dimensional scroll, which supports the additive-breakpoint approach. (W3C WAI "What's New in WCAG 2.1".) I could not confirm the exact wording of WCAG 2.2's 2.4.11 Focus Not Obscured from search; verify on w3.org before building sticky bars over focusable content.

Sources: Apple HIG (developer.apple.com/design/human-interface-guidelines, sidebars and split views); Raindrop.io help center (help.raindrop.io/ui, /bookmarks); Superhuman blog "How to build a remarkable command palette"; Retool "Designing the command palette"; Are.na help (help.are.na, channels and blocks); Oracle Master Detail pattern; Creo PageSplit docs; W3C WAI WCAG 2.1 summary.

---

## 4. Proposed app shell (desktop, `lg` and up)

One shared shell for every authenticated route, defined once in a route-group layout, instead of per-page `<main>` blocks. Mobile and tablet-portrait keep today's pages exactly as they are (the shell's sidebar is `hidden lg:flex`, and the content wrapper only loses its `max-w-3xl` at `lg`).

```
+------------------------------------------------------------------------------+
| SIDEBAR 248px   | TOP BAR (sticky, 56px)                                      |
|                 | [ Search or jump to...  Cmd+K ]        [+ Bookmark] [bell] [av]|
| KLECT           +--------------------------------------------------------------+
| [icon] @ryan    |                                                              |
|                 |   CONTENT AREA (fluid, max ~1200px, 12-col grid)             |
| Home            |                                                              |
| All bookmarks   |                                                              |
| Near me         |                                                              |
| Messages  (2)   |                                                              |
| Friends         |                                                              |
| Requests  (1)   |                                                              |
|                 |                                                              |
| LISTS     [+]   |                                                              |
|  (icon) Tokyo   |                                                              |
|  (icon) Recipes |                                                              |
|  (icon) Movies  |                                                              |
|  ...scrolls     |                                                              |
|                 |                                                              |
| Settings        |                                                              |
| Pro / Upgrade   |                                                              |
+------------------------------------------------------------------------------+
```

**Sidebar (left, persistent).**
- Top: wordmark and your avatar/handle (links to your profile).
- Primary nav, in this order: Home, All bookmarks, Near me, Messages (unread badge), Friends, Requests (count badge). Requests collapses into a badge on Friends if you want it shallower (see below).
- **Lists section** is the sidebar's real value: every list, icon plus name, drag-reorderable (reuse `reorderLists`), with a collapsed "Shared with me" group when the user has collaborator/viewer lists. Active list highlighted. A `+` creates a list inline. This removes the "go home to switch lists" trip entirely. Two levels only (section > list), per Apple's guidance; tags are a filter, not a sidebar tree.
- Bottom: Settings, and a Pro status chip. Free users see "3/3 lists, 14/20 bookmarks" as a quiet meter that links to `/upgrade`. This surfaces the cap *before* the user hits it, which is better than discovering it at a failed save.
- Locked lists (downgrade state) stay in the list, greyed, same `LOCKED_ART` treatment as today.

**Top bar.**
- Global search field that doubles as the command palette trigger (Cmd/Ctrl+K). Searches list names, bookmark names, tags, and people by @handle. Today's `SearchBar` is tag-only on home; this generalizes it.
- Primary action: **+ Bookmark** (always visible; opens the quick-add panel, see section 5). Context-aware: inside a list it defaults to that list.
- Notification/requests bell and avatar menu (profile, theme quick-switch, sign out). A theme quick-switch in the avatar menu is cheap and makes the six themes feel like a feature on desktop.

**Responsive behavior of the shell.**
- `lg` (1024 to 1279): sidebar collapses to a 64px icon rail (lists shown as emoji only, tooltip on hover). Content is fluid. Right panels open as overlays (slide-over), not docked.
- `xl` (1280 to 1535): full 248px sidebar. Right panel docks beside content.
- `2xl` (1536+): same, wider grid (4 to 5 columns), panel can be wider.
- Sidebar has a collapse toggle (Cmd+\\) with the state remembered per user (localStorage; no schema change).

**Theme fit.** The shell uses existing tokens only: `bg-panel` for sidebar and top bar, `border-border` for dividers, `text-muted` for inactive items, `bg-primary text-primary-ink` for the active item. Pixel skin: sidebar gets the 4px border and hard shadow via the existing `.pixel-box`; Modern: 1px border, soft shadow, gradient background shows through the content area; Journal: serif headings, 20px radii, solid warm background. No new tokens are required. The one new primitive worth adding is a `--sidebar-w` CSS var so the three skins can differ in density if the UI designer wants.

**Implementation notes for later (not done here).** Put the shell in a route-group `layout.tsx` (not `template.tsx`, which remounts per navigation and would re-animate the sidebar). The sidebar's lists need one cached read (`getUserLists`) per layout render. AGENTS.md says this Next.js version has breaking changes and to read `node_modules/next/dist/docs/` first, particularly for parallel and intercepting routes (used in section 5).

---

## 5. Per-screen layout proposals

Content width rule: stop using `max-w-3xl` as the page wrapper at `lg+`. Use full available width with a per-screen cap where reading comfort matters (settings, long text).

### 5.1 Home (dashboard)

Home stops being a vertical list of lists and becomes a launchpad.

```
+--------------------------------------------------------------------------+
| Good evening, @ryan                                   [ + New list ]     |
+--------------------------------------------------------------------------+
| YOUR LISTS (grid 3-4 col)                          view: [grid][compact]|
| +-------------+ +-------------+ +-------------+ +-------------+          |
| | (icon)      | | (icon)      | | (icon)      | | + New list  |          |
| | Tokyo       | | Recipes     | | Movies      | |  dashed     |          |
| | 24 saves    | | 8 saves     | | 31 saves    | |             |          |
| | [thumb strip: 3 latest bookmark images]       | |             |          |
| +-------------+ +-------------+ +-------------+ +-------------+          |
+------------------------------------------+-------------------------------+
| RECENTLY SAVED (grid of BookmarkCards)   | ACTIVITY (right column xl+)   |
| [card][card][card][card]                 | @sam commented on "Ramen"     |
|                                          | @jo voted in "Dinner poll"    |
|                                          | 2 unread in Tokyo chat        |
+------------------------------------------+-------------------------------+
```

- Lists become cards in a 3 to 4 column grid with a 3-image thumbnail strip (data already available: bookmark images). Drag to reorder stays, via a grip that appears on hover.
- **Recently saved** row gives the cross-list view that does not exist today.
- **Activity** column (xl+ only): new comments, poll activity, unread chats, pending requests. The data is mostly present already (unread counts, requests, comments); a unified "activity" feed would need a small new query. If that is too much for phase 1, ship the column as "Needs your attention" (requests, unread chats, unread DMs), which needs no new backend.
- List requests move into this column and the sidebar badge; `/requests` stays as a route for deep links and mobile.
- Tag filtering (today's `?tags=` on home) moves to "All bookmarks" (see below).

### 5.2 All bookmarks (new desktop home for retrieval)

Today cross-list browsing only exists as a tag-filter result on home. Give it a real page: `/` with `?tags=` can stay the data source, but surface it at its own sidebar item. Toolbar: search, tag filter (multi), list filter, sort (recent, rating, name), view switcher (grid, compact list, table). This is the Raindrop and Airtable-gallery pattern and is the biggest retrieval win. Needs no schema change; the query is a generalization of `getBookmarksByTags`.

### 5.3 List detail

The most important screen. Three zones: list header, bookmark area, and a right-side **context panel** that holds Comments, Chat, Polls and Members behind icon tabs.

```
+--------------------------------------------------------+-----------------+
| (icon) Tokyo 2027           [Chat 2] [Members] [Polls] | CONTEXT PANEL   |
| 24 bookmarks - 3 members              [Share] [...]    | [Comments][Chat]|
+--------------------------------------------------------+ [Polls][Members]|
| [search] [tags v] [hide visited] [sort v]  view:[##][=]|-----------------|
+--------------------------------------------------------+ List comments   |
| [card] [card] [card] [card]                            |  @sam: ...      |
| [card] [card] [card] [card]                            |  @jo:  ...      |
| [card] [card] [card] [card]                            |  [write...]     |
|                                                        |                 |
+--------------------------------------------------------+-----------------+
```

- **Bookmark area**: 3 columns at `lg`, 4 at `xl`, 5 at `2xl`, with a view switcher: card grid (today's card), compact list (one line each, thumbnail, name, tags, rating, location; best for triage), and later a map view (ties to Near me). Persist the choice per list in localStorage.
- **Context panel** (right, 360 to 400px, collapsible, remembers last tab). Replaces three separate things:
  - **Comments**: list comments, no longer pushed below the grid.
  - **Chat**: the group chatroom as a docked pane instead of the 70vh drawer. Same `ListChatLauncher` logic (realtime, unread, owner-only clear), re-hosted in a panel. The header chat button becomes a tab with an unread badge. On mobile it stays a drawer.
  - **Polls**: poll list and voting in the panel; "create poll" and poll results can still open as a page or a larger panel (poll results with many options need width).
  - **Members**: roster, roles, invite form. Owner management fits a panel well; requests (`CollabRequests`) live here too.
- Why a panel and not tabs: today `?tab=members` and `?tab=polls` replace the bookmark grid, so you cannot read the list while voting or chatting. Keeping the URL scheme (`?panel=chat`) preserves deep links and the back button while letting both stay visible.
- At `lg` (rail layout) the panel is a slide-over that sits on top of the grid; at `xl+` it docks and the grid reflows.
- Header actions (edit, duplicate, clear, delete, visibility) move from the toolbar triggers into a `...` menu plus a Share button. Role badges (Collaborator, Viewer, Public view only) stay.
- Selection mode: see section 6.

### 5.4 Bookmark detail: panel, not page (with a page fallback)

Recommendation: **open in a right-side detail panel from the list grid, keep the full page as the canonical URL.**

```
+-------------------------------------------+------------------------------+
| LIST GRID (dimmed or narrowed to 2 col)   | BOOKMARK PANEL (520px)       |
|  [card][card*]                            | < prev  next >        [x][^] |
|  [card][card]                             | [ photo carousel / video ]   |
|                                           | Name             [stars]     |
|                                           | [Open link] [Share] [Visited]|
|                                           | description, location, tags  |
|                                           | Notes                        |
|                                           | Comments                     |
+-------------------------------------------+------------------------------+
```

- Clicking a card opens the panel; the grid stays put, the card stays highlighted (Creo/Oracle guidance), scroll position preserved. `j/k` or arrow keys move prev/next; Esc closes. This turns triage from "open, read, back, scroll back" into a flowing review.
- URL still changes to `/lists/[id]/bookmarks/[bid]` (Next.js intercepting route: soft navigation renders the panel over the list, a hard load or shared link renders the full page). Sharing links, DMs with `SharedBookmarkCard`, and the mobile deep link all keep working. The `^` button expands to the full page.
- Full page at desktop gets a two-column layout too (hero media left, details and comments right) so it is not a 672px strip.
- Opening from All bookmarks or Near me also uses the panel, with a list chip showing which list it belongs to.
- Edit: inline editing in the panel for rating, visited, tags, notes (all currently reachable only via the header edit form). Full edit stays a modal/form.

### 5.5 Near me: map plus list split

```
+----------------------------+-----------------------------------------------+
| Near me                    |  [ MAP ]                                      |
| radius [1 mi v]  [Locate]  |       (pin) (pin)                             |
| lists: [x]Tokyo [x]Food    |   (you)        (pin)                          |
| 12 within 1 mi - 3 skipped |                  (pin)                        |
|----------------------------|                                               |
| 1. Ramen Ichi   0.2 mi     |   selected pin -> small popover card          |
| 2. Cafe Blue    0.4 mi     |                                               |
| 3. ...                     |                                               |
+----------------------------+-----------------------------------------------+
```

- Left 380px results list (existing sorted-by-distance logic, `BookmarkCard` in a compact variant), right: map filling the rest. Hover a row, the pin highlights; click a pin, the row scrolls into view and the bookmark panel can open.
- Map is the biggest net-new feature. Mobile already uses Mapbox, `NearbyBookmark` already returns `lat`/`lon`, and the web docs call out "no in-app map" as a known gap. Using Mapbox GL JS in the browser needs a **public** (`pk.`) token with URL restrictions, which departs from the current "Mapbox secrets stay server-side" rule (see Open Decision 3).
- Desktop users often are not where their saves are (planning a trip), so add a "search an area / show all" mode: map shows all geocoded bookmarks, and the radius filter is optional. This also fixes the empty-state of "grant location permission or see nothing".
- Without a map (phase 1 fallback): still do the two-pane layout with the list on the left and a static panel on the right showing the selected bookmark's detail. That alone beats the current single column.

### 5.6 Friends and Messages: one workspace

Merge Friends, Requests, Pending and Messages into a single `/friends` workspace with a two-pane layout.

```
+-----------------------------+----------------------------------------------+
| [Messages][Friends][Requests 1][Pending]  | @sam                  [...]    |
| [ + Add by @handle ]        |----------------------------------------------|
|-----------------------------|  messages...                                 |
| @sam      "ok see you"  2m  |                                              |
| @jo       "sent a link" 1h  |                                              |
| @mia                        |  [ type a message ...            ] [Send]    |
+-----------------------------+----------------------------------------------+
```

- Left: segmented list (Messages, Friends, Requests, Pending). Right: the conversation (existing `DmThread`) or, for a friend row, their profile summary with "Invite to lists" (the existing `FriendRow` bulk-invite logic) and "Message".
- Real URLs are kept: `/friends/dms/[conversationId]` renders inside the workspace at `lg+`, and as today's standalone page below it. Realtime and unread logic stay as is.
- Requests and Pending become sub-lists with inline Accept/Decline; no separate pages needed on desktop.
- Shared bookmarks in a DM (`SharedBookmarkCard`) open the bookmark panel.

### 5.7 Settings

Two-pane: left sub-nav (Profile, Membership, Appearance, Notifications/Integrations (iOS share sheet, Chrome extension), Privacy and blocked users, Feedback, Account), right a single section at a time at `max-w-2xl`. Routes become `/settings/[section]` with `/settings` redirecting to the first at `lg+`; below `lg` the current single page remains.

- Pull **Theme** out of the profile form into its own Appearance section with live previews of all six themes (swatch cards). It is the most distinctive thing about Klect and currently buried in a form.
- Membership section gets the usage meter (lists and bookmarks used vs limit) as visual bars.
- Danger zone (delete account) is last and visually separated, behind the existing confirm.

### 5.8 Profile

```
+----------------------------+---------------------------------------------+
| (avatar)                   | PUBLIC LISTS  (grid 2-3 col of list cards)  |
| @ryan                      | [card] [card] [card]                        |
| Member since 2025          |                                             |
| 12 public lists | 8 friends|                                             |
| [Add friend] [Message] [..]|                                             |
+----------------------------+---------------------------------------------+
```

Left identity rail (sticky), right grid of public lists using the same list card as Home. Settings gear is no longer the only door to settings, because Settings is in the sidebar. Adds a "Message" action when friends (the DM link exists). Moderation actions (block, report) tuck into a `...` menu rather than inline buttons.

### 5.9 Auth, onboarding, marketing, legal

Unchanged. They are pre-shell, single-column, and fine. The landing page (`LandingPage`) is a separate desktop-width concern for marketing; out of scope here but should be reviewed with the same lens.

---

## 6. Desktop-only interactions

All of these are gated by `@media (hover: hover) and (pointer: fine)` or by `lg+` as appropriate, so touch devices never see hover-only UI. Nothing here can be the *only* way to do a thing; each has a visible button equivalent.

**Hover actions on cards.** On hover/focus-within a card reveals: a selection checkbox (top-left), quick actions (top-right): open link, mark visited, move to list, tag, `...`. The card's main click still opens the panel. Always visible on keyboard focus.

**Multi-select and bulk bar.** Click the hover checkbox (Raindrop pattern) or press `x` on a focused card; shift-click selects a range; Cmd/Ctrl+A selects all in view. A sticky bottom bar appears: `N selected  [Move] [Copy to] [Tag] [Mark visited] [Delete]  [Clear]`. Respect roles (viewer: no bar; collaborator: add/edit, delete per existing rules) and locked states. Note that "Copy to list" is the safer name: the product model creates an independent copy per list in `/bookmarks/new`, so "Move" would be delete-plus-copy. Confirm that semantics (Open Decision 4).

**Drag and drop.**
- Reorder lists in the sidebar and home (existing `reorderLists`).
- Drag one or many bookmarks from the grid onto a **list in the sidebar** to copy or move them there (hold Option/Alt to copy vs move, with the drop target label stating which). This is the desktop-only superpower and the strongest justification for the persistent list sidebar. Bookmark ordering inside a list does not currently exist as a concept (no per-list manual order is documented), so do not add bookmark reordering unless Ryan wants it.
- Drop a URL from the browser address bar onto the window or a sidebar list to start a quick-add (uses the existing metadata autofill).
- Always provide the non-drag path (Move menu) for keyboard and assistive tech users.

**Quick-add.** The `+ Bookmark` button opens a compact modal: one URL field, autofill fills in name, image, location, with list selector (defaults to current list) and tag input. Paste anywhere in the app (when no input is focused) with a URL on the clipboard opens it prefilled. Full form is one click away. This puts capture at one keystroke instead of the current multi-step create flow.

**Command palette (Cmd/Ctrl+K).** Phase 2. Sections: Jump to (lists, friends, conversations), Bookmarks (search), Actions (new bookmark, new list, new poll, toggle theme, open settings, sign out). Each row shows its shortcut. Recent items first.

**Keyboard shortcuts.** Keep a small, learnable set; show a `?` cheat-sheet overlay.

| Keys | Action |
|---|---|
| Cmd/Ctrl+K | Command palette |
| `/` | Focus search |
| `c` | New bookmark (quick-add) |
| `g` then `h` / `b` / `n` / `m` / `f` | Go to Home / All bookmarks / Near me / Messages / Friends |
| `j` / `k` or arrows | Move focus through cards; Enter opens the panel |
| `x` | Toggle select on focused card |
| `e` | Edit focused/open bookmark |
| `[` / `]` | Previous/next bookmark in open panel |
| Esc | Close panel, modal, or clear selection |
| Cmd/Ctrl+\\ | Toggle sidebar |

Accessibility rule for these: WCAG 2.1.4 requires single-key shortcuts to be disableable or only active in context. Ship a "Keyboard shortcuts" on/off toggle in Settings, and never fire single-key shortcuts while typing in an input, textarea, or contenteditable.

**Context menus.** Right-click on a card or sidebar list opens the same actions as the `...` menu (do not replace the browser menu on links without a clear action set). Optional, low priority.

**Density options.** Comfortable (default) and compact (tighter cards, smaller thumbnails, single-line rows). Store per user in localStorage. Cheap to build with a data attribute on the shell (`data-density`), and it sits naturally alongside the theme attribute, though it must be tested against the pixel skin, which depends on big borders.

**Resizable panels.** Right panel width draggable between 320 and 560px, remembered. Nice to have; fixed width is acceptable for v1.

---

## 7. Breakpoint strategy

Tailwind v4 defaults: `sm` 640, `md` 768, `lg` 1024, `xl` 1280, `2xl` 1536. Proposal is purely additive:

| Width | Behavior |
|---|---|
| below `lg` (under 1024) | **Exactly today's layout**: single column, per-page `<main>`, no sidebar, existing drawers and tab strips. No regressions by construction: new shell classes are all `lg:`-prefixed. |
| `lg` 1024 to 1279 | Icon-rail sidebar (64px) plus top bar. Fluid content. Right panels are slide-overs. List grid 3 col. |
| `xl` 1280 to 1535 | Full sidebar. Right panel docks. Grid 3 to 4 col. Home activity column appears. |
| `2xl` 1536+ | Wider grid (4 to 5 col), content region capped near 1400px so line lengths and card sizes stay sane on ultrawide. |

Notes:
- **iPad landscape** (1024 to 1366) will hit `lg`/`xl`. That is fine and desirable (it gets the shell), but hover-only affordances must key off `(hover: hover)`, not width, so a touch iPad still gets visible buttons and long-press instead of hover reveal. Every hover action needs a touch-reachable path (the `...` button is always rendered, just visually quieter).
- Implementation approach: one `AppShell` component that renders its sidebar `hidden lg:flex`; page components keep their existing markup but their wrapper changes from `max-w-3xl` to `max-w-3xl lg:max-w-none` (or a per-screen cap). Where a screen needs a materially different structure (list detail, friends, nearby, settings), build the desktop structure as a sibling component rendered with `hidden lg:block`, and leave the mobile one `lg:hidden`. Duplicated data fetching is avoided because both render from the same RSC props.
- **Unchanged on mobile and tablet portrait**: top-of-page headers with Back/Home buttons, tab strips on list and friends pages, bottom-sheet-style chat drawer, full-page bookmark detail, one-column settings, stacked cards.
- Reflow: at 320px and 400% zoom the app must collapse to the mobile layout (WCAG 1.4.10). Because the shell is `lg:`-gated, browser zoom on a laptop that drops the viewport below 1024 CSS px will correctly swap to the mobile layout; test that explicitly.
- Motion: `template.tsx` fades in every route. With a persistent shell, only the content region should animate, and panel open/close should be 150 to 200ms. Respect `prefers-reduced-motion` (already handled via `MotionConfig reducedMotion="user"`).

---

## 8. Accessibility notes

- **Landmarks**: sidebar `<nav aria-label="Primary">`, top bar `<header>`, content `<main>` (one per page; the shell owns it so pages stop rendering their own `<main>` at desktop), right panel `<aside aria-label="List context">`. Add a "Skip to content" link as the first focusable element.
- **Sidebar list**: `aria-current="page"` on the active item (the existing `ListTabs` already does this; match it). Drag reorder needs a keyboard alternative (a "Move up / Move down" item in each list's `...` menu).
- **Panels**: bookmark panel is a non-modal complementary region when docked, and a modal dialog (focus trap, `aria-modal`, Esc to close, return focus to the originating card) when it is an overlay at `lg`. Opening must move focus to the panel heading; closing must restore it.
- **Hover-revealed controls** must also appear on `:focus-within` so keyboard users can reach them, and must meet the 24px minimum target size.
- **Multi-select**: announce count changes via an `aria-live="polite"` region ("3 selected"). Checkbox must be a real `<input type="checkbox">` with a label including the bookmark name.
- **Command palette**: combobox/listbox pattern, `aria-activedescendant`, focus trap, Esc closes, returns focus.
- **Shortcuts**: per WCAG 2.1.4, provide the off switch and context-scoping noted above. Show shortcut hints in tooltips and menus. Do not rely on a shortcut as the only route.
- **Contrast across six themes**: the sidebar introduces new text-on-panel combinations (muted text on panel for inactive items, badges on active items). Check `text-muted` on `bg-panel` and `text-primary-ink` on `bg-primary` for each of the six themes at 4.5:1; the pixel-dark and journal-light muted values are the likeliest to be marginal. Also check focus rings against each skin (pixel's thick borders can hide a thin ring; use a 2px offset outline in `--primary`).
- **Sticky bars and focus**: the sticky top bar and bulk-action bar must not cover the focused element when tabbing (WCAG 2.2 "Focus Not Obscured", verify exact criterion text on w3.org). Use `scroll-padding-top` / `scroll-padding-bottom` equal to bar heights.
- **Zoom/reflow**: verify 200% and 400% zoom collapses cleanly (see section 7).
- **Live regions**: chat and DM panels should announce new messages politely without stealing focus; unread badges need text alternatives ("2 unread messages").

---

## 9. Phasing (suggested order)

1. **Shell**: sidebar, top bar, content width fix, Home grid. Biggest visible win, lowest risk, unlocks everything else.
2. **List detail**: grid columns, view switcher, right context panel (comments first, then Members, Polls, Chat).
3. **Bookmark panel** via intercepting route, plus prev/next and inline edit.
4. **Friends/Messages workspace** and **Settings two-pane**.
5. **All bookmarks** page, hover actions, multi-select, bulk bar, drag-to-sidebar.
6. **Near me map**.
7. **Command palette and shortcuts**, density option.

Each step ships independently and leaves mobile untouched, which matches the repo rule about landing UI in both apps (this is a web-only presentation change: no schema, no tRPC contract changes in steps 1 to 5 other than optional read queries; steps 1 to 5 need no mobile work).

---

## 10. Open decisions for Ryan (ranked)

**1. Side panel versus full page for bookmark detail. Recommend: panel (intercepting route), full page kept as canonical URL.**
The panel keeps your place in a list, enables prev/next triage, and works with comments beside content. The cost is real: Next.js intercepting and parallel routes are more complex than plain pages, and this Next.js version has breaking changes (AGENTS.md), so the implementer must read the bundled docs first. The alternative (keep full pages, just widen them to two columns) is cheaper and still a clear improvement, but it keeps the "open, read, go back" loop that makes list triage slow. My position: the panel is the single interaction that most separates a "desktop app" from "stretched mobile", so it is worth the complexity. Do the cheap two-column full page first as the fallback inside the same work.

**2. How much to invest in the shell on the first pass: sidebar-with-lists, or top-nav only. Recommend: full sidebar with the lists tree.**
A top nav is easier (five links, a search) and still fixes "enlarged mobile". But the lists tree in the sidebar is what makes cross-list work fast, is the drop target for drag-to-move, and answers the question "where am I" permanently. Klect's core object is the list; it deserves permanent presence, as Apple's guidance on sidebars lists collections as their natural content. Risk: users with many lists (the free cap is 3 owned, but collab/viewer lists are uncapped) make the sidebar long. Mitigation: collapsible "Shared with me" group, internal scroll, search-in-sidebar via Cmd+K. Don't ship top-nav-only; it would need redoing.

**3. In-app web map for Near me. Recommend: yes, but as phase 6, after the two-pane layout lands without it.**
Map is the most delightful desktop-and-travel-planning feature and the data (`lat`/`lon`) is already returned. But it requires a client-exposed Mapbox token (public `pk.` tokens are designed for this and can be URL-restricted, but it breaks the current "Mapbox stays server-side" convention) plus a map library bundle (about 200KB gzipped for Mapbox GL JS), plus usage billing exposure. Alternatives: Leaflet with a different tile provider (cheaper, uglier, theming is harder across six skins), or no map. Ship the split layout first (no new dependency), then add the map once you have decided on token policy and cost. Also note the "N skipped" problem: only autocomplete-picked locations have coordinates, so a map will look sparse for legacy bookmarks until a backfill or re-geocode exists. That may matter more than the map library.

**4. "Move" versus "Copy" semantics for bulk and drag operations. Recommend: ship Copy-to-list as default, with an explicit Move that is copy plus remove, and label it honestly.**
The data model says a bookmark belongs to one list and `/bookmarks/new` creates an independent copy per list. There is no many-to-many link, so "move" is really "create in target, delete in source", which loses comments and poll references. Users dragging a card onto a list expect a move. Either (a) add a true `moveBookmark` core function that updates `listId` (preserving comments, with a rule for tags since tags are user-scoped and poll membership), or (b) label the drag as "Copy" and require a modifier for move-by-copy-delete. I recommend (a) because dragging a card into another list and losing its comments would be a trust-breaking surprise. This is a backend change in `core/bookmarks.ts` plus a tRPC procedure, so it triggers the both-apps rule (mobile may want it too) and must respect the free-tier 20-bookmark cap and locked-list rules. Raise with the Klect manager before building.

**5. Add lightweight analytics before the big structural bets. Recommend: yes, a small one.**
Vercel Analytics is installed in `layout.tsx` but no desktop-versus-mobile split or task data is documented. Before investing in the dashboard activity column, density options, or command palette, check what share of sessions are desktop and which routes they hit (lists? friends? nearby?). If desktop share is low, steps 1 to 4 of the phasing are still right and 5 to 7 should wait; if high, push steps 5 to 7 sooner. Cheap to check (existing Vercel Analytics dashboard, no code), so do it before committing past phase 4.

---

## 11. Out of scope and risks

- Mobile app, Chrome extension, backend contract changes beyond the optional `moveBookmark` and read-only queries noted above.
- The marketing landing page redesign.
- Visual design: colors, type scale, spacing, card art. The UI designer's next step. This doc only fixes structure, behavior, and priority.
- Risk: the pixel skin's heavy 4px borders and offset shadows consume width and look cluttered with a sidebar plus two panels. The UI designer should test the shell in all three skins early and may need a reduced border weight for large surfaces in pixel (keeping thick borders for buttons and cards).
- Risk: `template.tsx` page-fade on every navigation will feel sluggish in a shell with persistent panels; scope it to the content region.
- Risk: realtime chat in a docked panel stays subscribed while the user browses; ensure `subscribeListChat` unsubscribes cleanly when the panel is closed or the list changes (the current launcher handles open state; verify with the new always-mounted panel).
