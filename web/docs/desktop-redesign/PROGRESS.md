# Desktop redesign: progress log

Running log per phase. Strategy: `ux-strategy.md`. Mockups: `mockups/`.

## Phase 1: shell, widths, home, All bookmarks (2026-10-19)

Status: built, uncommitted. tsc, lint, build green.

### What was built

- **App shell** for signed-in pages (lg+ only). Route group `src/app/(app)/` with a layout that renders `AppShell` only when there is an onboarded session (so `/` still serves the landing page to signed-out visitors). Sidebar: wordmark, profile link, Home, All bookmarks, Near me, Messages (unread DM count), Friends (incoming friend requests), Requests (pending list invites), owned lists, a collapsible "Shared with me" group, a "+" new list link, Settings, and the free-plan usage meter (non-Pro only, from `getSelectionStatus`). Icon rail at lg (1024 to 1279), full 248px at xl. Top bar: search box (GET form to `/bookmarks?q=`, Cmd/Ctrl+K focuses it), "+ Bookmark" (links to `/bookmarks/new`), bell disclosure (list requests, friend requests, unread messages), avatar link. Skip-to-content link.
- **Standalone pages stay outside the group** and get no shell: login, forgot/reset password, onboarding, privacy, terms, invite, upgrade (+ success), downgrade, offline, not-found.
- **Per-page Back/Home links that point to `/`** are `lg:hidden` (nearby, requests, friends, messages inbox, settings, profile, new bookmark, list header). Contextual "up" links (to Friends, to Messages, bookmark detail Back) are kept.
- **Widths** at lg+: home 1400px, All bookmarks 1400px, list detail `max-w-6xl` (bookmark grid 3 columns at lg), nearby and profile `max-w-5xl`, friends/messages/requests `max-w-4xl`, settings `max-w-2xl`, new bookmark `max-w-3xl`. DM thread height accounts for the 56px top bar.
- **Home at lg+** (`components/home/DesktopHome.tsx`): greeting and summary, list card grid with 3-photo strips (`ListGridCard`), a dashed "New list" tile that switches to an upgrade prompt at the free cap, a Grid/Compact switch (`?lists=compact` shows the existing drag-reorderable rows), Recently saved (8 newest cross-list bookmarks), and at xl a "Needs your attention" column (pending list invites with Approve/Reject using the existing `approveRequest`/`rejectRequest` actions, friend-request and unread-message counts). Below lg the original home renders unchanged. While tag-filtering (`?tags=`), the original results view renders at all widths, widened at lg.
- **All bookmarks** (`/bookmarks`, new): cross-list grid or compact rows (`BookmarkRow`), search (name, description, location), tag filter (OR, user's own tags), list filter, sort (newest, oldest, rating, name), grid/compact toggle, "Show more" paging (60 per page, cap 600). All state in the URL, validated server-side. `/bookmarks/new` unchanged.

### Data access added (read-only, no schema or tRPC changes)

- `lib/bookmarks.ts`: `getVisibleBookmarks`, `countVisibleBookmarks`, `toBookmarkCardData`, `BOOKMARK_SORTS`. Visibility = membership (same set as `getBookmarksByTags`). Locked rows included and rendered read-only when the bookmark or its list is locked. Bookmarks have no author column, so there is no per-author block filtering to apply (blocks keep filtering comments, chat, DMs on their existing paths).
- `lib/lists.ts`: `getListPreviewImages` (newest 3 photos per list, scoped to the user's memberships, locked flag per image).
- `lib/shell.ts`: React-`cache`d shell reads (`getShellData`, `getCachedUserLists`, `getCachedIncomingRequests`, `getCachedSelectionStatus`) so the sidebar, top bar and home share one read per request.
- `lib/all-bookmarks.ts`: URL state type and href builder shared by the page and its client toolbar.

### Decisions

- Route group over a conditional root layout: the root layout cannot see the pathname, and the group keeps every URL unchanged.
- Per-page fade moved from the root template into `(app)/template.tsx`, below the shell layout, so only the content column re-animates; the shell never remounts. The root template remains for standalone pages (its key is the `(app)` segment, stable across app pages). Mobile fade behavior is the same as before.
- The shell keeps window scroll (sticky sidebar and top bar) instead of an inner scroll container, so existing pages, drawers and anchors behave as before.
- Shell data streams behind Suspense with a sidebar skeleton; identity renders from the session immediately.
- Pixel skin uses 3px shell dividers (not 4px) per the strategy's clutter risk; modern/journal use 1px and 12px radii. All colors from tokens.
- The desktop home is a sibling tree (`hidden lg:flex`) and the mobile home is `lg:hidden`, per strategy section 7, rather than restyling one tree.
- `app/loading.tsx` moved into the group (it was the home skeleton). Standalone pages no longer show that home skeleton while loading.

### Verification

- `npx tsc --noEmit`, `npm run lint`, `npm run build`: pass.
- Visual: no test account was available, so signed-in pages could not be screenshotted. A temporary dev-only harness rendered the real shell and desktop-home components with fixture data (no DB) and was checked in headless Chrome at 1440 (modern light), 1280 (pixel light) and 1100 (journal dark, icon rail). The harness was deleted afterwards. Signed-out `/` (landing) and `/login` were checked at 390px and render without the shell; `/bookmarks` signed-out redirects to `/login`.
- Not verified visually: real signed-in pages at any width (including mobile below lg), the All bookmarks page UI, live badge counts.

### Known gaps / next

- Layouts do not re-render on soft navigation, so sidebar counts and the lists tree refresh on full loads and on server actions that revalidate, not on every click.
- Shell and desktop-home reads also run on mobile (the server cannot see the viewport); the UI is CSS-hidden there.
- Sidebar list drag-reorder, theme quick-switch in the avatar menu, context-aware "+ Bookmark" default list, sidebar collapse toggle: not built.
- The attention column's Approve/Reject reuse `/requests`' server-action forms, which do not toast (row disappears on revalidate). Add toasts when that page gets them.
- Bookmark detail and polls pages are not widened (phases 2 and 3).

## Phases 2 and 3: list detail and bookmark side panel (2026-10-19)

Status: built, uncommitted. tsc, lint, build green. Everything new is lg (1024px) and up; below lg the list and bookmark pages render the same markup as before.

### What was built

- **List detail at lg+.** A right-hand region (`ListDesktopLayout`) beside the page: sticky under the top bar, full viewport height. It shows the **context panel** with tabs Comments, Chat, Polls, Members (non-members: Comments only, read-only). Inactive tabs stay mounted so a half-typed comment survives a switch; tabs follow the WAI-ARIA tabs pattern (arrow keys). The panel collapses to a 56px icon rail; collapsed state and last tab are remembered per viewer in localStorage (`klect:list-panel:<userId>`, every access in try/catch with an in-memory fallback). `?tab=members|polls` still works: below lg it swaps the page content as before, at lg+ it keeps the grid and opens that panel tab.
- **Chat as a panel tab.** `ListChatLauncher.tsx` now holds `ListChatProvider` (one state, one realtime subscription and poll loop per page), the drawer launcher (unchanged look and behavior below lg; the header icon is `lg:hidden`) and `ListChatInline` (the room inside the Chat tab). The Chat tab carries the unread badge (also on the collapsed rail); the room counts as "open" (mark read, no badge) only while the tab is actually visible at lg+.
- **Compact desktop header.** At lg+ the Home link and the List/Members/Polls pill bar are hidden (the sidebar and panel replace them), the role/public badges move onto the stats line, and two actions sit beside the title: owner "Share" (opens the Members tab with the invite form; other members get "Members") and an owner visibility button (calls the existing `setListVisibility`, toasts, icon-only at lg, labelled at xl). New bookmark and the ⋮ menu are unchanged.
- **Grid toolbar.** At lg+ search, Tags and "Show only unvisited" share a row, plus a sort menu (Newest, Oldest, Top rated, Name; client-side over the loaded rows) and a Grid/Compact switch (compact reuses `BookmarkRow`; remembered per list as `klect:list-view:<listId>`). Sort and view apply only at lg+ (`useIsDesktop`), so a narrow window never inherits them.
- **Container-aware grid.** The grid wrapper is a size container at lg+: 2 columns by default, 3 from a 42rem column, 4 from 64rem (`lg:@2xl:` / `lg:@5xl:`), so it reflows as the panel opens, widens or collapses. Also fixes a Phase 1 bug where cards kept `sm:col-span-2` inside the 3-column lg grid.
- **Bookmark side panel (Phase 3).** At lg+ a plain left click on a card or row opens the bookmark in the right region: header with Prev/Next, "N of M" (or "Not in current filter"), open-full-page and close; body with photo gallery (or video), title and visited badge, rating (inline editable when writable), "in <list>", Open link, Send (existing share sheet), Mark visited, Edit (inline form, same `updateBookmark`), description, Location/Links details, tags, notes, Delete, and comments. Prev/next follow the grid's current filter and sort. The open card is outlined. Esc closes; J or Right steps next, K or Left steps previous; ignored while typing in an input/textarea/select/contenteditable, with modifier keys, or while a dialog is open. Focus moves to the panel on open and returns to the card on close; the active card is scrolled into view while stepping. Cmd/Ctrl/Shift/middle clicks still open the full page.
- **Full bookmark page at lg+.** Two columns: media left (sticky), details right (same `BookmarkInfo` as the panel), with the Back button above. Below lg the original single-column markup renders unchanged.

### Decision: search param, not an intercepting route

Read `intercepting-routes.md` and `parallel-routes.md` in `node_modules/next/dist/docs`. Chose `?b=<bookmarkId>` on the list URL. Reasons: (1) interception is decided by the router on every soft navigation, not by viewport, so a phone tap on a card would also be intercepted, while below lg the card must keep opening the full page; (2) prev/next must follow the grid's search/tag/visited filter and sort, which is client state in `ListBookmarks` that a separate `@slot` route segment cannot see; (3) it needs no `@slot`/`default.tsx`/catch-all scaffolding under `lists/[id]`, which also hosts the poll routes. The full bookmark URL stays canonical: it is every card's href, the panel's "open full page" link, and direct load or refresh of `/lists/[id]/bookmarks/[bid]` renders the full page. A `?b=` URL loaded below lg is forwarded to the full page. Opening pushes one history entry; stepping replaces it; closing pops it (so Back closes the panel).

### Files

- New: `src/lib/client-prefs.ts` (localStorage prefs via useSyncExternalStore, `useIsDesktop`, typing-target check), `src/lib/bookmark-detail.ts` (`getBookmarkDetail`, the one read for the full page and the panel, including the lock/permission derivation), `src/components/lists/ListDesktopLayout.tsx` (region, context tabs, collapsed rail, bookmark panel frame, keyboard, `ListDesktopActions`), `src/components/bookmarks/BookmarkDetailView.tsx` (`BookmarkMedia`, `BookmarkInfo`, `BookmarkPanelContent`, `BookmarkPageDesktop`), `src/components/bookmarks/BookmarkGallery.tsx`, `src/components/bookmarks/BookmarkDesktopActions.tsx`.
- Changed: `src/app/(app)/lists/[id]/page.tsx` (loads chat, polls, the open bookmark; mobile/desktop content split), `src/app/(app)/lists/[id]/bookmarks/[bid]/page.tsx` (uses `getBookmarkDetail`; lg+ two-column sibling), `src/components/lists/ListChatLauncher.tsx`, `src/components/lists/ListPageHeader.tsx` (no longer async; no `userId` prop), `src/components/bookmarks/ListBookmarks.tsx`, `BookmarkCard.tsx` and `BookmarkRow.tsx` (optional `active`/`onOpen`, `data-bookmark-card`), `BookmarkHeader.tsx` (extracted `BookmarkEditCard`, same behavior), `src/components/comments/CommentSection.tsx` (`plain` prop), `src/lib/actions/comments.ts` (`addBookmarkComment` also revalidates `/lists/[id]`, so a comment posted in the panel shows and card comment counts refresh; auth/role checks untouched), `src/app/globals.css` (`.list-panel`, `.list-panel-head`, token colors, 3px pixel / 1px modern and journal).
- No schema, tRPC, permission or lock-rule changes. No new client tRPC. All mutations are the existing server actions.

### Verification

- `npx tsc --noEmit`, `npm run lint`, `npm run build`: pass. Built CSS checked: the container rules are emitted inside the `lg` media query.
- Visual and behavior: no signed-in session, so a temporary dev-only harness page rendered the real `ListDesktopLayout`, `ListPageHeader`, `ListBookmarks`, `ListChatProvider`, `CommentSection`, `PollsView`, `BookmarkPanelContent` and `BookmarkPageDesktop` with fixture data (no DB reads of app data, no writes), with a placeholder sidebar/top bar, driven by headless Chrome (playwright-core from a scratch dir). Server action calls were aborted at the network layer (they need a session). Seen: 1440 modern light (3-column grid, Comments tab), Chat tab inline with badge cleared on open, collapse to rail (4 columns) persisted across reload and restored on the Chat tab, card click to `?b=bm3` with panel open and focus on the panel, `j` to `bm4` with "4 of 8", Left back to `bm3`, `j` inside the comment textarea ignored, Esc closed and focus returned to the card, sort Name plus Compact view, 1100 pixel light with panel open by direct `?b=` load (2 columns), 1920 journal dark (4 columns), 1280 modern dark `?tab=members` (grid plus Members tab), the lg+ two-column full page, 900 pixel dark and 390 modern light (old single column, pill tabs, chat icon; panel not displayed), the chat drawer at 390, and a card click at 390 navigating to the full bookmark route (which redirected to /login, no session). A second throwaway harness with a `loading.tsx` and a 1.5s server delay confirmed that opening the panel does not flash the route's loading skeleton; the grid stays and the panel appears when ready. Both harnesses were deleted.
- Not verified: real signed-in pages with real data at any width; MembersPanel (DB-backed, a placeholder was used); real chat send/realtime; edit/delete/visited/rating/comment round-trips from the panel; video bookmarks in the panel; locked lists/bookmarks in the panel; mobile pixel-diff against the pre-change pages (no baseline screenshots exist).

### Known gaps / next

- Every open/step re-renders the list page server-side (list, comments, polls, members, chat first page and the bookmark), since the panel rides on the page's search params. Fine at current sizes; a streamed Suspense split or a lighter read could come later.
- The page now loads bookmarks, comments, polls, members and chat for every tab and width (the server cannot see the viewport), and `?tab=members` renders `MembersPanel` twice (mobile body plus panel). CSS-hidden, as in Phase 1.
- The Send sheet and chat drawer are bottom sheets; opened from the panel at lg+ they still slide up full width and render under the sticky top bar's stacking layer.
- Not built from the mockups: hover select, bulk bar, map view, avatar stack in the header, inline tag add in the panel, panel resize, a slide-over (instead of docked) panel at lg as the strategy suggested. All Bookmarks and Near me do not open the panel (they keep linking to the full page).
- Pre-existing copy that contains em dashes was carried over verbatim where moved (chat empty state, list empty state, comments in moved code).

## Phase 4: messages and friends workspace, settings two-pane, profile rail (2026-10-19)

Status: built, uncommitted. tsc, lint, build green. Everything new is lg (1024px) and up; below lg every page renders the same markup as before (new wrappers are plain blocks or `display: contents`, desktop pieces are `hidden lg:*`).

### What was built

- **Messages and Friends workspace** (`app/(app)/friends/layout.tsx`, `components/friends/FriendsWorkspacePane.tsx`). A layout under `/friends` draws a left pane at lg+ that stays mounted across `/friends`, `/friends/dms`, `/friends/dms/[id]`, `/friends/dms/new`, `/friends/requests`, `/friends/pending`; the page is the right pane. Left pane: Messages | Friends switch (WAI-ARIA tabs, arrow keys, unread and request counts), Messages = New chat + inbox (unread dot, "You:" prefix, time, delete with confirm, open row highlighted with `aria-current`), Friends = inline add by @handle (`AddFriendForm inline`), incoming requests (Accept/Decline), sent requests (Withdraw), friends (`FriendRow` with a new Message button, so remove and add-to-lists stay reachable). The switch follows the URL until flipped. Selecting a conversation is a real `Link` to `/friends/dms/[id]`, so the URL updates, back works and direct load renders the thread in the right pane. The inbox refreshes on the user's realtime channel plus the open conversation's channel, on every conversation switch, and by polling; all of that only runs at lg+ (`useIsDesktop`). Request rows toast and `router.refresh()`.
- **Right pane per route.** `/friends/dms/[id]`: the existing `DmThread` (same realtime, mark-read, report, safety and block controls), edge to edge at lg with a divided header and a View profile button; Back is `lg:hidden`. `/friends` and `/friends/dms`: an empty state (`WorkspaceEmpty`) at lg; their old content is wrapped in `MobileOnly`, which unmounts it after hydration on a desktop-width window so its polling does not run twice. `/friends/dms/new`, `/friends/requests`, `/friends/pending`: unchanged pages shown in the right pane.
- **Settings two-pane** (`app/(app)/settings/layout.tsx`, `components/settings/SettingsNav.tsx`, `sections.ts`). Left section nav: Profile, Membership, Appearance, Share extension, Blocked users, Feedback, Privacy and terms, Account. `/settings?section=<id>` picks the section (validated, default Profile); Share extension and Feedback are their existing pages, now rendered inside the same layout (their "Settings" back link is `lg:hidden`, width `lg:max-w-3xl`, share steps two columns). Below lg `/settings` is the original stacked page (a sibling `lg:hidden` tree) and ignores `?section=`. There is no Notifications section: notification preferences are mobile-only (no web push).
- **Appearance** (`components/settings/ThemePicker.tsx`). Six live previews, each a real radio input whose preview carries its own `data-theme`, styled only by `.theme-prev` classes keyed off that attribute (not `.pixel-box`, whose skin overrides key off the page theme). Picking previews on the whole page; Save posts to the existing `updateProfile` with the saved handle, names and avatar as hidden fields; toast on success or failure; leaving unsaved restores the saved theme. The lg+ Profile section uses `ProfileForm showTheme={false}`, which posts the saved theme from props so a profile save cannot undo an Appearance change. Onboarding and the mobile settings page keep the old in-form picker.
- **Membership** at lg+ adds two usage bars (lists, bookmarks; `role="meter"`) above the same plan copy (`MembershipBody`, shared with the stacked page). **Account** puts delete account last, set apart.
- **Profile** (`users/[handle]`). lg+ grid: a sticky identity rail (avatar, @handle, member since, stats, friend state, Add friend, a new Message button for friends, Settings for your own profile, Block/Report as today) beside the public lists as `ListGridCard`s (2 columns, 3 at xl) with photo strips from the new `getPublicListPreviewImages` in `lib/profile.ts` (scoped to `isPublic: true`). Below lg the original header, centered identity and list cards render.
- **Requests page**: already `lg:max-w-4xl` since Phase 1, so left as is. **Feedback**: widened as above.

### Files

- New: `app/(app)/friends/layout.tsx`, `app/(app)/settings/layout.tsx`, `components/friends/FriendsWorkspacePane.tsx`, `components/friends/WorkspaceEmpty.tsx`, `components/dms/MessageFriendButton.tsx`, `components/settings/ThemePicker.tsx`, `components/settings/SettingsNav.tsx`, `components/settings/sections.ts`, `components/ui/MobileOnly.tsx`.
- Changed: `app/(app)/friends/page.tsx`, `friends/dms/page.tsx`, `friends/dms/[conversationId]/page.tsx`, `settings/page.tsx`, `settings/feedback/page.tsx`, `settings/share-extension/page.tsx`, `users/[handle]/page.tsx`, `components/dms/DmThread.tsx` (lg-only spacing), `components/friends/FriendRow.tsx` (optional `actions`, `narrow`), `components/friends/AddFriendForm.tsx` (optional `inline`), `components/profile/ProfileForm.tsx` (optional `showTheme`), `lib/profile.ts` (read-only preview query), `app/globals.css` (Phase 4 block at the end: `.ws-*`, `.set-nav`, `.theme-*`, `.prof-rail`, lg-scoped where the element is visible on mobile).
- No schema, tRPC, permission or action changes; no new client tRPC. All mutations are the existing server actions. Nothing in the Phase 5 file set was touched.

### Verification

- `npx tsc --noEmit`, `npm run lint`, `npm run build`: pass.
- Visual: no signed-in session. A temporary dev-only harness page rendered the real `FriendsWorkspacePane`, `DmThread`, `WorkspaceEmpty`, `MobileOnly`, `SettingsNav` links, `ThemePicker`, `ProfileForm`, `BlockedUsersSection`, `ListGridCard`, `MessageFriendButton` and `ProfileModerationActions` with fixture data inside a placeholder sidebar/top bar, plus copies of the new page markup for the thread, settings and profile layouts. Server action calls were aborted at the network layer. Driven by headless Chrome. Seen: workspace at 1440 modern light (Friends tab with requests, pending, friends; Messages tab with unread dots and badge; delete confirm; arrow keys move between tabs), 1100 pixel dark and 1024 pixel light (rows wrap instead of overflowing, found and fixed during the check), 1280 journal light thread; 390 (mobile content shown, pane and desktop empty state hidden; thread as before). Appearance at 1440 modern light, a live pick of Pixel Dark (page theme switched, Save enabled, "Previewing" note), arrow keys move the radio, 1100 journal dark; Profile section without the theme picker; 390 settings without the nav. Profile rail and grid at 1440 modern light and 1280 pixel light, and 390 unchanged. Harness deleted.
- Not verified: the real routes with real data (no login), including the layout reads, URL-driven active row and tab, direct load of `/friends/dms/[id]` in the workspace, realtime refresh, accept/decline/withdraw/delete/send round trips, Save theme persisting, the settings `?section=` routing, feedback and share-extension inside the layout, and public-list preview images from the database.

### Known gaps / next

- `/friends` reads run in both the layout and the page (the page needs them below lg), and the layout's reads also run on mobile where the pane is hidden. Same trade-off as the shell; a `cache()` wrapper could dedupe the page/layout pair.
- The left pane's friends and requests refresh on server actions and full loads, not live (no realtime for friend requests), like the shell badges.
- Thread header lacks the mockup's "Invite to lists" button (invites stay on the friend row's Add).
- Theme previews follow `THEME_OPTIONS` order (Pixel first), not the mockup's Modern-first order.
- Display settings from the mockup (density, shortcuts toggle, reduce motion) are not built; they belong to Phase 7.

## Phase 5: move, multi-select, bulk bar, drag to sidebar (2026-10-19)

Status: built, uncommitted. tsc, lint, build green. Backend contract added (mobile UI not built). Web UI is lg+ only.

### Backend (once, for both apps)

- `core.moveBookmarks(userId, ids, targetListId)` / `core.moveBookmark` in `lib/core/bookmarks.ts`: a true re-parent (`Bookmark.listId` update), so id, comments, images, rating, visited, notes, video and tag links survive. This settles strategy Open Decision 4 as option (a). The pure rules live in `lib/move-plan.ts` (`planBookmarkMove`). They are: COLLABORATOR on the destination and on every source (`assertRole`); refuse a locked destination, locked source list, or locked bookmark (`LockedError`); cap only bookmarks moving from a list someone else owns into one the caller owns (`assertCanCreateBookmark`). Own-to-own moves are net zero, and moves into someone else's list are never capped, the same as `createBookmark`. Ids already in the target are skipped. Limit is 200 ids. The move is all or nothing in one interactive transaction, with each source group updated under a `listId` and unlocked guard, so a concurrent change rolls the whole move back.
- Tags: every `BookmarkTag` link is kept, including tags owned by source members who are not in the destination. Members already see all tags on a bookmark, tag search is membership-scoped, and destination collaborators can strip a tag with `removeTagFromList`. Moving back restores the bookmark exactly.
- Polls: poll options for moved bookmarks are deleted with their votes (polls belong to the source list), the same as a delete.
- `core.deleteBookmarks`: bulk delete with the same per-item rules as `deleteBookmark` (allowed on locked rows), in one transaction.
- No bulk tag-add: there is no single-item add-tag mutation to reuse (tags only change through the full `updateBookmark`). Deferred.
- tRPC: `bookmarks.move`, `bookmarks.moveMany`, `bookmarks.deleteMany`, documented in `../DESIGN.md` (API contract and permissions table). Server actions `moveBookmarks` / `deleteBookmarks` in `lib/actions/bookmarks.ts` return a `BulkBookmarkResult` instead of throwing (production strips thrown messages), and revalidate the whole layout.
- No schema change.

### Web UI (lg+)

- `BookmarkSelectable` wraps each card or compact row in the list grid and in All bookmarks. It adds a real checkbox (top-left) and hover/focus actions (top-right): Open link, Copy link, Move to list (keyboard menu), and Delete (inline confirm). Viewers and view-only rows get none of these. Locked rows can be selected and deleted but not moved. Controls also show on coarse pointers.
- Selection: checkbox, Shift-click range (checkbox or card), Cmd/Ctrl-click toggle, Cmd/Ctrl+A selects all in view (only while a selection exists), Esc clears (it yields to an open bookmark panel first). Deliberate change: at lg+ on editable grids, Cmd/Ctrl/Shift-click on a card now selects instead of opening a new tab or window. Middle-click and the Open full page control still open the page.
- `BookmarkBulkBar`: a sticky bottom bar with the count (`aria-live`), Move to list, Delete, and Clear. An action is enabled only if it is valid for every selected item; otherwise it is disabled with a reason.
- Drag: a card, or the selected group (shown with a count drag image), can be dropped onto a sidebar list. The target row highlights with "Move here". View-only lists, locked lists, and the source list decline the drop and dim. Moved cards dim while the request runs and disappear from the list grid on success; on failure they are restored. Toasts cover success, error, and the free-cap refusal with Upgrade. The keyboard alternative is the Move to list menu.
- Sidebar list reorder: drag a row within its group (your lists, or Shared with me). It reuses `reorderLists` and keeps the owned/shared interleaving Home uses (`ShellData.listOrder`). The new order shows optimistically and rolls back with a toast on error. Bookmark drags and list drags use different drag types, so they do not collide.
- Files: new `lib/move-plan.ts`, `lib/multi-select.ts`, `lib/bookmark-dnd.ts`, `lib/bookmark-mutations.ts`, `components/bookmarks/{BookmarkSelectable,BookmarkBulkBar,MoveToListMenu,AllBookmarksResults,useBookmarkSelection}.tsx/ts`, and `scripts/verify-move-plan.ts`. Changed: `lib/core/bookmarks.ts`, `lib/actions/bookmarks.ts`, `server/trpc/routers/bookmarks.ts`, `lib/types.ts` (optional `url`), `lib/bookmarks.ts` (`url` in card data), `lib/shell.ts` (`listOrder`), `components/shell/SidebarNav.tsx`, `components/bookmarks/ListBookmarks.tsx`, `app/(app)/lists/[id]/page.tsx`, and `app/(app)/bookmarks/page.tsx`.

### Verification

- `npx tsc --noEmit`, `npm run lint`, `npm run build`: pass. Extension typecheck also clean.
- `npx tsx scripts/verify-move-plan.ts`: 11 DB-free checks of the move rules pass (caps in each ownership direction, locks, skip-already-there, missing id, limits). Role checks and the transaction were not exercised. No DB writes were made, and no local database was available.
- Visual/behavior: a temporary dev-only harness (fixture data, no DB, deleted afterwards) was driven with headless Chrome at 1440 (modern light). Verified: hover actions; Shift range (3 selected); Cmd-click toggle (no new tab); bulk bar with Move disabled once a locked card is selected; Esc clears; the keyboard Move menu (focus on first item, arrows, Esc returns focus); and drag types plus dragover. Recipes highlighted, while the source list, locked list and viewer list declined and dimmed. On drop, `moveBookmarks(["b1","b2"],"l2")` was posted. Server actions were aborted at the network layer (no session), so the error path was seen: "Something went wrong" toast, cards restored, selection kept. The sidebar reorder posted the expected merged order, then rolled back on the aborted call. On All bookmarks, only editable rows got controls. At 390px no controls were visible.
- Not verified: a successful move or delete against a real DB (success toasts, the card disappearing, sidebar counts refreshing); real pointer drag in Firefox/Safari; the free-cap toast; compact rows, pixel and journal skins, the lg icon rail; and the mobile UI for the new procedures (not built).

### Known gaps / next

- Mobile has no move or bulk UI yet; the procedures are ready for it.
- No undo after a move. No "Copy to list" (strategy option). No bulk mark-visited or tag.
- Sidebar reorder has no keyboard path (Home's compact list keeps drag reorder).
- The "N of M" prev/next order includes cards hidden after a move until the refresh lands.

## Phase 6: Near me split, command palette, shortcuts, density (2026-10-19)

Status: built, uncommitted. tsc, lint, build green. Everything new is lg (1024px) and up; below lg every page renders as before (the Near me mobile tree is the same markup inside plain wrappers, the palette, shortcuts and density CSS do nothing below lg).

### What was built

- **Near me at lg+** (`components/bookmarks/NearbyFinder.tsx`, `app/(app)/nearby/page.tsx`). Two panes: left keeps the radius select, list chips, Find near me button, permission and error copy, the location banner, the count and the "N skipped" note, with results as compact numbered rows (photo, name, list, distance, locked badge); right is the selected result's detail using the Phase 3 `BookmarkPanelContent` (gallery, rating, Open link, Send, Mark visited, Edit, details, tags, notes, Delete, comments), with open-full-page and close. Empty states for before searching, no results, and "pick a result". Selection is `?b=<id>` on `/nearby`, read through `getBookmarkDetail` (same permission and lock derivation as the full page; an unreadable id shows "not available"). Results are client state and survive the `?b=` navigation. Push on open, replace on switch, pop on close; Esc closes; focus moves into the pane on open and back to the row on close; modified and middle clicks still open the full page. Below lg the original card grid renders.
- **No map slot.** A web map is blocked on the public Mapbox token decision (strategy Open Decision 3: a client `pk.` token plus a map bundle and billing exposure). Nothing map-related is rendered or loaded; no token was added.
- **Command palette** (`components/shell/CommandCenter.tsx`, `CommandPalette.tsx`). Cmd/Ctrl+K toggles it; focusing, clicking or typing into the top bar search opens it (and focus returning to the search from a closing palette does not reopen it). One overlay portalled to `<body>` with groups Jump to (Home, All bookmarks, Near me, Messages, Friends, Requests, Settings), Lists (the viewer's lists from the cached shell read, streamed as a promise; Shared and Locked labelled), Bookmarks (server search, two or more characters, 200ms debounce, stale responses ignored, max 8 rows) and Actions (New bookmark, in the current list when on one; New list; Keyboard shortcuts). Fuzzy matching (`lib/fuzzy.ts`: exact, prefix, word start, substring, then subsequence such as "jcc"). Arrows move, Enter runs, Esc closes, Tab is held in the field, mouse hover and click work. Combobox plus listbox with groups, `aria-activedescendant`, `aria-modal` dialog, polite live status. Focus returns to where it was on close (not after navigating). A bookmark result opens `/lists/<listId>?b=<id>` (the list page with its side panel). Not available below lg.
- **Bookmark search action** (`lib/actions/palette.ts`, `searchPaletteBookmarks`): `requireUser`, trims and caps the query (100 chars), reuses `getVisibleBookmarks` (membership visibility, the All bookmarks read) with a take of 8, returns locked rows flagged, never throws for a DB error (`[palette]` log, error result). Read only, no tRPC, no schema change.
- **Keyboard shortcuts** (`CommandCenter`). `g` then `h`/`b`/`n`/`m` (1.5s window), `c` new bookmark (current list preselected on a list page), `/` opens search (the palette), `?` opens the shortcuts sheet (`ShortcutsSheet.tsx`, a modal with focus trap that states whether single-key shortcuts are on and links to Settings). Never while typing in an input, textarea, select or contenteditable, never with Cmd/Ctrl/Alt, never while a dialog is open, never below lg.
- **Shortcuts on/off and density in Settings, Appearance** (`components/settings/DesktopPrefs.tsx`, `lib/desktop-prefs.ts`). A "Desktop display" card under Theme: Density (Comfortable | Compact radios) and a Keyboard shortcuts switch (`role="switch"`, default on). Stored per viewer in localStorage (`klect:density:<userId>`, `klect:shortcuts:<userId>`) through `client-prefs` (try/catch, in-memory fallback). Per WCAG 2.1.4 the switch covers single-character keys only: `g`, `c`, `/`, `?`, and the Phase 3 J and K in the list panel. Esc (Phase 3 panel close and Phase 5 selection clear), the arrow keys, Cmd/Ctrl+K and Cmd/Ctrl+A are not character keys and always work. Palette hints and panel button titles drop the single-key hints when off.
- **Density.** `data-density="compact"` on the shell root (`#app-shell`), set before paint by an inline script (the bundled Next guide "preventing flash before hydration": server `text/javascript`, client `text/plain`, `suppressHydrationWarning`) plus a client effect for later changes and client-side arrivals (`components/shell/DensitySync.tsx`, `components/ui/InlineScript.tsx`). CSS (globals.css, Phase 6 block) is inside the lg media query only: grid gaps 16px to 10px and card padding 16px to 10px/12px on `.dens-grid` (list grid, All bookmarks grid, home list and recent grids) and `.dens-card` (`BookmarkCard`, `ListGridCard`). Borders and shadows are untouched, so the pixel skin keeps its frame.
- **Layering fix.** The Send sheet (`ShareBookmarkSheet`) and the list chat drawer (`ListChatLauncher`) now render through `components/ui/BodyPortal.tsx` (a `createPortal` to `<body>`, mounted after hydration). Opened from the desktop bookmark panel (inside the transformed page-fade wrapper and the sticky panel), they used to be trapped in those stacking contexts under the z-30 top bar; at the root their z-40 backdrop and z-50 sheet sit above it. Same look and behavior on mobile.
- **Context-aware "+ Bookmark"** (`components/shell/NewBookmarkButton.tsx`): on `/lists/<id>` and anything under it, it links to `/bookmarks/new?list=<id>`. The add page (`app/(app)/bookmarks/new/page.tsx`) now accepts `?list=` and preselects it only if it is one of the writable, unlocked lists it already offers (so a viewer-only, locked, foreign or stale id preselects nothing); `CreateBookmarkFlow` gained an optional `initialListIds`. Without the param the page is unchanged.
- **Sidebar counts after bulk move/delete.** Already handled in Phase 5 and confirmed rather than changed: `moveBookmarks` and `deleteBookmarks` call `revalidatePath("/", "layout")` and the client calls `router.refresh()`. In this Next version (`server/app-render/action-handler.js`) any revalidation in a server action makes the response re-render the current route tree including the `(app)` layout, so the sidebar counts update in the same round trip. Single-item actions that revalidate any path (create, edit, delete, rating, visited, comment) refresh the shell the same way.

### Files

- New: `lib/desktop-prefs.ts`, `lib/fuzzy.ts`, `lib/commands.ts`, `lib/actions/palette.ts`, `components/shell/{CommandCenter,CommandPalette,ShortcutsSheet,DensitySync,NewBookmarkButton}.tsx`, `components/ui/{BodyPortal,InlineScript}.tsx`, `components/settings/DesktopPrefs.tsx`.
- Changed: `components/shell/{AppShell,GlobalSearch,TopBar}.tsx`, `components/bookmarks/{NearbyFinder,ShareBookmarkSheet,CreateBookmarkFlow,BookmarkCard,ListBookmarks,AllBookmarksResults}.tsx`, `components/lists/{ListChatLauncher,ListDesktopLayout,ListGridCard}.tsx`, `components/home/DesktopHome.tsx`, `app/(app)/nearby/page.tsx`, `app/(app)/bookmarks/new/page.tsx`, `app/(app)/settings/page.tsx`, `app/globals.css` (Phase 6 block at the end), `docs/nearby.md`.
- No schema, tRPC, permission, lock-rule or mutation changes. No new npm packages. No new client tRPC.

### Verification

- `npx tsc --noEmit`, `npm run lint`, `npm run build`: pass. (The build prints Google Fonts download stack traces for the landing page's Plus Jakarta Sans when the network is restricted; it still exits 0, as before.)
- DB-free unit checks run with `npx tsx` from a scratch file (not committed): `newBookmarkHref` for list, nested bookmark, home and All bookmarks paths; `listIdFromPath` false-match guard; `bookmarkPanelHref` encoding; fuzzy empty, no-match, subsequence ("jcc"), prefix-first ordering. All pass.
- Visual and behavior: no signed-in session. A temporary dev-only harness page (deleted afterwards; `find src -iname '*harness*'` returns nothing) rendered the real `DensitySync`, `CommandCenter` (palette and sheet), `GlobalSearch`, `NewBookmarkButton`, `NearbyFinder`, `BookmarkPanelContent`, `DesktopPrefs`, `BookmarkCard` and `ShareBookmarkSheet` with fixture data, inside a placeholder sidebar and a real-class sticky top bar, and a transformed content wrapper like the page-fade template. Driven by headless Chromium (playwright-core in a scratch dir). Server action calls were rerouted by request header to three throwaway harness actions returning fixtures (no DB, no auth); navigations away from the harness were recorded and blocked. Seen:
  - Near me 1440 modern light: idle empty state; after Find near me (granted fake geolocation), 3 numbered rows, the skipped note, "Pick a result" pane; a row click requested `/nearby?b=bm2`; loaded with `?b=bm1`, the pane showed the full detail and row 1 was outlined (`aria-current`); Esc requested `/nearby`; `?b=missing` showed "not available". 1440 pixel dark and 1024 journal light render the split. 390: card grid only, rows and pane not displayed.
  - Palette 1440: Cmd+K opens a modal dialog with focus on the combobox, 3 groups and 13 options idle; "cof" showed the list and (after debounce, via the fixture action) the bookmark; ArrowDown moved `aria-activedescendant`; Tab kept focus in the field; Enter requested `/lists/l1?b=bm1` and closed; Esc closed and returned focus to the previously focused input; focusing the top bar search opened it; Esc returned focus to the search without reopening; clicking the focused search reopened it; "jcc" fuzzy matched Jersey City Coffee; clicking a locked bookmark result requested `/lists/l2?b=bm3`. Journal light and pixel light palettes checked.
  - Shortcuts: `g h`, `g n`, `c` requested `/`, `/nearby`, `/bookmarks/new`; `g`, a 1.7s pause, then `h` did nothing; `/` opened the palette; `?` opened the sheet with focus on Close and Tab trapped; keys typed into an input did nothing. Switch off: stored "off", `g h`, `?` and `/` did nothing, Cmd+K still opened the palette, and the palette showed no single-key hints. At 390 nothing opened and nothing navigated.
  - Density: comfortable gap 16px and padding 16px; Compact sets `data-density="compact"`, stores "compact", gap 10px, padding 10px 12px (also seen in pixel dark); at 390 the same compact attribute leaves 16px. With every JS chunk blocked (React never hydrated), a reload with compact stored still had `data-density="compact"`, so the inline script applies it before paint.
  - Layering: the Send sheet opened from a sticky panel inside the transformed wrapper is a direct child of `<body>`, and the topmost element at the top bar's center is the sheet's backdrop.
- Not verified: anything signed in with real data (the real shell, the real `/nearby?b=` round trip and its server read, the real palette search against the database, `/bookmarks/new?list=` preselection on the real page, sidebar counts after a real bulk move); the real list page's J/K with the switch off (the same hook and condition, not driven); the chat drawer layering at a resize (same portal as the Send sheet); Firefox and Safari; screen reader output.

### Known gaps / next

- No web map (Mapbox public token decision pending). Near me has no "search this area" or show-all mode; results still need geolocation.
- The palette searches bookmarks and lists only; people, conversations, "Recent" items and theme toggle from the mockup are not built.
- `c` and "+ Bookmark" open the full add page, not a quick-add modal.
- Edits made in the Near me detail pane refresh the pane through the action's revalidation; deleting from it follows the existing delete action and redirects to the bookmark's list (same as the list panel).
- Palette list entries refresh when the shell layout re-renders (full loads and revalidating actions), like the sidebar.
- Density covers grids and cards only (not rows, panels or the sidebar).

## Final summary and test checklist

Phases 1 to 6, polish round 1 and round 2 are built and uncommitted. Nothing changes below 1024px (except the round 2 empty-state copy fixes, which show at every width). To test, run `npm run dev` from `web/`, sign in at `http://localhost:3000`, and use a window at least 1024px wide (try 1100 for the icon rail and 1440 for the full sidebar). Repeat a few screens in one pixel, one modern and one journal theme.

### Click-through by screen

**Shell (every signed-in page)**
- Sidebar: Home, All bookmarks, Near me, Messages (unread count), Friends (request count), Requests (invite count), your lists, Shared with me (collapses), "+" new list, Settings, free-plan meter.
- Drag a list row up or down in the sidebar: order sticks after a reload.
- Tab to a list row in the sidebar and press Alt+Up or Alt+Down (Option on a Mac): the row moves, keeps focus, and the order sticks after a reload.
- At 1280+ press Cmd/Ctrl+\ or the "Collapse sidebar" button under Settings: the sidebar becomes the icon rail; reload, it stays collapsed with no flash of the full sidebar. Press again to expand.
- Top bar: bell menu shows requests and unread messages; avatar goes to your profile.
- On a list page, "+ Bookmark" opens the add page with that list already ticked; elsewhere nothing is ticked.
- Tab once from the address bar: "Skip to content" appears.

**Command palette and shortcuts**
- Cmd/Ctrl+K and clicking the search box both open the palette. Type part of a list name, then two or more letters of a bookmark name: Lists and Bookmarks groups appear. Arrow down, Enter: a bookmark opens its list with the side panel open.
- Esc closes and puts focus back where it was.
- With focus on the page (not in a field): `g h`, `g b`, `g n`, `g m`, `c`, `/`, `?`.
- Copy a link in another tab, click an empty part of the page (not a field), press Cmd/Ctrl+V: Quick add opens with the link, the name fills in, the list defaults to the current list (or the last one used). Save: "Saved to <list>" toast with Open, and the bookmark is in that list. Esc closes and focus returns.
- Settings, Appearance: turn Keyboard shortcuts off; the single keys, J/K and paste-to-quick-add stop, Cmd/Ctrl+K, Esc and arrows still work. Turn it back on.

**Home**
- Lists grid with photo strips; Grid/Compact switch; dashed New list tile (upgrade prompt at the free cap); Recently saved; at 1280+ the Needs your attention column (approve or reject an invite: a toast either way, and the row goes).

**All bookmarks**
- Search, tag filter, list filter, sort, grid/compact, Show more.
- Hover a card: checkbox and actions; select several, use the bulk bar to move or delete; check the sidebar counts change right away.
- Move one or several, then press Undo in the toast: they go back to their lists. Try Copy to list (hover action or bulk bar): the originals stay, copies appear in the target. Mark visited / Mark unvisited from the bulk bar.

**List detail**
- Right panel tabs: Comments, Chat (unread badge clears when viewed), Polls, Members; collapse to the rail and reload.
- Click a card: the bookmark panel opens; J/K or arrows step; Esc closes and focus returns to the card; Back closes it too.
- In the panel: Send (the sheet covers the top bar), rating, visited, Edit, comment.
- Owner: Share and the public/private button.
- Shift-click a range, Cmd/Ctrl-click to toggle, drag cards onto another list in the sidebar, then Undo from the toast (the cards come back).
- `?tab=members`: Members opens in the panel and the page shows one roster (check the invite form works once).

**Near me**
- Find near me (allow location): numbered rows on the left, "N skipped" note if any.
- Click a row: detail on the right; click another; Esc or X closes; Back closes; the expand icon opens the full page.

**Messages and Friends**
- Left pane Messages | Friends; open a conversation, send, check realtime; accept or decline a request; add a friend by @handle.

**Settings**
- Each section in the left nav; Appearance: theme previews and Save, Density Comfortable/Compact (grids tighten), Keyboard shortcuts switch; reload to confirm both stick.

**Profile**
- Identity rail with stats, Add friend or Message, and public lists as cards.

**Below 1024px**
- Narrow the window or use a phone: every page should look exactly as before the redesign (Back/Home links, tab strips, chat drawer, full-page bookmarks).

### Consolidated known gaps (all phases)

- Nothing signed-in was verified visually by the builders; every visual check used fixture harnesses with server actions blocked or faked. Real data, real round trips and realtime need Ryan's click-through above.
- Shell, home, list and friends reads also run on mobile (the server cannot see the viewport); the desktop UI is CSS-hidden there. With `?tab=members|polls` the server HTML still carries two copies (mobile body and desktop panel); the roster is read once per request (cached) and the mobile copy unmounts after hydration at lg+.
- Layouts do not re-render on soft navigation, so sidebar counts, the lists tree and palette lists refresh on full loads and on server actions that revalidate.
- Every bookmark panel open or step re-renders the list page server-side.
- No web map on Near me (public Mapbox token decision). No search-this-area mode.
- Not built from the mockups or strategy: theme quick-switch in the avatar menu, a quick-add modal behind "+ Bookmark" and `c` (they still open the full add page; only paste opens Quick add), avatar stack in the list header, inline tag add in the panel, panel resize, slide-over panel at lg, Invite to lists in the DM header, bulk tag, palette people/conversations/recent, Activity feed on home, right-click menus, a web map.
- Mobile has no UI yet for the Phase 5 and round 2 bulk procedures (`moveMany`, `deleteMany`, `copyMany`, `setVisitedMany`).
- Undo after a move is one move per source list (each its own transaction, stops at the first refusal) and cannot bring back poll options the move dropped.
- Copy to list and Mark visited are only offered where selection exists (rows the viewer can edit); a viewer cannot copy out of a list they only view. Copy writes one bookmark at a time (not one transaction).
- Paste-to-quick-add listens for the browser `paste` event; whether Safari fires it with focus on a non-editable element is unverified.
- With five hover actions, the overlay covers the right part of a photo-less card's title line while hovered.
- `core.toggleVisited` (single item) does not refuse locked rows, while the new bulk `setVisitedMany` does. Pre-existing; left unchanged.
- Theme previews follow the Pixel-first order, not the mockup's Modern-first.
- Other pre-existing copy still has em dashes (friends, comments and polls empty states, home compact lists, profile, settings, legal pages, landing page). Only the three carried-over ones were fixed.

## Polish round 1 (2026-10-19)

Status: built, uncommitted. tsc, lint, build green. No schema, tRPC or mutation changes.

### 1. No profile photos

Klect avatars are the user's emoji (`User.icon`). The Google OAuth `image` URL is no longer rendered anywhere. New `components/ui/UserIcon.tsx` (`UserIcon`, `userIconOf`, one fallback `🔖`, the profile form's default; some places used `🙂` before). `shell/UserAvatar.tsx` is emoji-only and `ShellUser` lost `image`. Converted: sidebar, profile rail, mobile home header, comments, members panel, friend rows, friends workspace (inbox and requests), DM inbox, DM thread header, new chat list, friend requests and pending pages, blocked users, share sheet friend picker, poll voters and poll creator. Left on purpose: `getPublicProfile` still selects `image` because the `profile.*` tRPC procedure returns it to mobile (API contract unchanged).

### 2. Top bar profile button removed

`TopBar` keeps search, "+ Bookmark" and the bell. The profile is reached from the sidebar's profile row (icon rail at lg, labelled at xl).

### 3. Settings nav is text only

Icons removed from `settings/sections.ts` and `SettingsNav`.

### 4. No forced capitals

Removed every `uppercase` class (PixelButton, PixelBadge, settings nav heading, profile stats, members panel, list toolbar, friend row, friends tabs and workspace, poll tabs, search bar, list grid tag menu, tag input suggestions, bookmark form, bookmark detail block titles and Open link, sidebar section labels, attention menu, command palette groups, shortcuts sheet, move menu, landing eyebrows) and the caps letter-spacing that went with them (`tracking-wide`, `tracking-widest`, `tracking-[0.06em]`). globals.css: dropped `text-transform: uppercase` on the theme preview button and the now-redundant `text-transform: none` overrides (modern and journal tags, preview button). Literal strings: "KLECT" to "Klect" (login, forgot and reset password, mobile home), "GAME OVER" to "Game over" (404). The text inside those elements was already sentence case. Kept: single-letter key caps in the shortcuts sheet and palette hints (G, H, J, K) and "⌘K"/"Ctrl K"; bookmark-name initials in thumbnails; user-typed data; the uppercase hex note in a code comment.

### 5. Bookmark thumbnails

Root cause (from code; the read-only DB audit of stored image hosts was not permitted, so the per-host breakdown is unmeasured):
- Every thumbnail was a bare `<img>` with no `referrerPolicy`, so the browser sent the Klect origin as Referer and hotlink-protected CDNs refused it.
- No load-failure handling anywhere, so any dead URL showed the browser's broken-image icon.
- Social reels (Instagram, Facebook, TikTok) go through Microlink first and store signed CDN URLs that expire (fbcdn `oe=`, TikTok `x-expires`); those break permanently after days, and no client fix can bring them back.
- Unfurler images (LinkPreview, Microlink, YouTube) are stored as returned, unlike the self-fetch path which resolves relative URLs, decodes entities and upgrades http to https.
- `fromPage` keeps only the first og:image, so most bookmarks have one photo and the "next image" fallback rarely has anything to try.
- Not a cause: next/image `remotePatterns` (remote photos never used next/image).

Shipped (client): `components/ui/RemoteImg.tsx` (plain img, `referrerPolicy="no-referrer"`, `onFail` including failures that fire before hydration) and `components/bookmarks/BookmarkThumb.tsx`: tries each photo in `images` (max 4), then a themed tile (`shell-thumb-empty` tint) with the site's favicon from `urls[0]` (`https://host/favicon.ico` on a white chip, no third-party favicon service), else the name's initial, else a link glyph. Fixed-size frame, image and tile fill it absolutely, so no layout shift. Used by BookmarkCard, BookmarkRow (also for rows with no photo), ListGridCard strips (home and profile), Near me rows, DM shared bookmark cards, poll thumbs, bookmark form photo previews. BookmarkGallery and the full page photo grid (`BookmarkPhotoGrid`) drop failed photos and show the tile if none load; the video poster hides on failure. `BookmarkCardData.images` and `ListPreviewImage.{images,url,name}` added (read-only selects).

Server-side options (not built):
- Re-host at save time to Supabase Storage (CLAUDE.md deferred item): fetch the chosen image in `core.createBookmark`/`updateBookmark` (SSRF guard from `page-text`, byte cap, image content-type check), store `bookmarks/<id>/<hash>.webp`, save the storage URL. Fixes expiry and hotlinking for new saves; needs a backfill script for old rows (dead links cannot be recovered). Effort about 1 to 2 days with mobile unaffected (URLs stay strings). Cost: Supabase Storage 100 GB included on Pro, then about $0.021/GB; at roughly 150 KB per image, 10k bookmarks is about 1.5 GB, negligible. Adds latency to save unless done after the response.
- Image proxy route (`/api/img?u=`): fixes Referer checks but not expiry, becomes an open proxy unless signed, and costs function time and bandwidth on every view. Not recommended.
- next/image with wildcard `remotePatterns`: same open-proxy concern plus per-transform billing.
- Cheap first step: normalize unfurler image URLs in `metadata.ts` the same way `resolveImages` does.

### Verification

- `npx tsc --noEmit`, `npm run lint`, `npm run build`: pass.
- A temporary dev-only harness page rendered the real BookmarkCard, BookmarkRow, ListGridCard, BookmarkGallery, SettingsNavLinks, PixelButton, PixelBadge, UserAvatar and UserIcon with fixture data (one same-origin photo and a `.invalid` URL) in pixel-light, modern-dark and journal-light wrappers, screenshotted with headless Chrome at 1440. Seen: good photo renders; broken-then-good shows the second photo; broken with a github.com link shows the favicon tile; broken with an unreachable host shows the initial; a gallery with one bad photo shows the good one without arrows; an all-failed gallery shows the tile; strips mix photos and the tile at the same height; buttons, badges and labels in mixed case; settings nav text only; emoji avatars with the 🔖 fallback. Harness deleted (`find src -iname '*harness*'` returns nothing).
- Not verified: the page's `<html>` was modern-light (no session), so the pixel and journal wrappers inherited modern skin overrides; the Press Start 2P lowercase rendering and real pixel/journal skins were not seen. Nothing signed-in (top bar, sidebar, real thumbnails from real data) was seen.

## Round 2 (2026-10-19)

Status: built, uncommitted. tsc, lint, build green; `scripts/verify-move-plan.ts` passes (11 checks). No schema change, no new npm packages, no new client tRPC. Everything new is lg (1024px) and up, except the empty-state copy fixes.

### What was built

1. **Duplicate renders and reads.** `MembersPanel` reads through new per-request cached `getCachedListMembers` / `getCachedPendingInvites` (`lib/sharing.ts`), so the two server renders under `?tab=members` share one read; the list page wraps the mobile copy of the members (or polls) view in `MobileOnly`, so only one copy stays mounted after hydration at lg+. The server cannot see the viewport, so its HTML still carries both copies (CSS-hidden one). `/friends`: new `lib/friends-workspace.ts` (React `cache`) shares conversations, incoming and outgoing requests, and friends plus the owned-list picker data between `friends/layout.tsx` and the `/friends`, `/friends/dms`, `/friends/requests` and `/friends/pending` pages.
2. **Attention column toasts.** `components/home/AttentionRequestActions.tsx`: Approve and Reject call the same `approveRequest` / `rejectRequest` actions (they do not redirect), then toast "You joined <list>." / "Request rejected." or a fixed error, hide the row and `router.refresh()`.
3. **Keyboard list reorder.** In the sidebar, Alt+Up / Alt+Down (Option on a Mac) on a focused list row moves it one place within its group (your lists, or Shared with me), with an optimistic order, focus kept on the row, a polite live region ("Recipes moved to position 1 of 3." or "already first"), a hidden description on each row, and a 600ms debounced save through the same `reorderLists` (so several presses are one write; errors roll back with the existing toast).
4. **Undo after move.** `core.moveBookmarks` now also returns `bySource` (moved ids grouped by the list they left), passed through the `moveBookmarks` action and documented on `bookmarks.moveMany` in `../DESIGN.md` (additive). The success toast (8s, pauses on hover) offers Undo, which calls `moveBookmarks` once per source list, so every rule applies again (roles, locks, free cap); a refusal toasts "Couldn't undo: <reason>" (or the free-cap toast with Upgrade). Grids show the cards again when they come back (`useBookmarkSelection` un-hides cards moved back into the grid's list). Toast de-duplication now keeps the newest action, so a repeated message's Undo undoes the latest move.
5. **Copy to list.** New `core.copyBookmarksToList` writes each copy through `core.createBookmarkInLists` (the `/bookmarks/new` path), after checking VIEWER+ on every source, no locked source bookmark or list, and the free cap once for the whole batch. Copies keep fields, rating, visited and tags (like `lists.duplicate`). Action `copyBookmarks`, tRPC `bookmarks.copyMany` (documented). UI: a Copy to list hover action beside Move on each editable card, and a Copy to list button in the bulk bar, both using `MoveToListMenu` with `verb="Copy"`; the toast offers Open; the bulk selection clears on success.
6. **Bulk Mark visited / Mark unvisited.** New `core.setVisitedMany` (sets, not toggles; COLLABORATOR per bookmark's list, the `toggleVisited` rule; refuses locked rows; one transaction scoped per list and to unlocked rows). Action `setBookmarksVisited`, tRPC `bookmarks.setVisitedMany` (documented). The bulk bar shows "Mark unvisited" only when every selected bookmark is visited, otherwise "Mark visited"; disabled with a reason when a locked or view-only row is selected.
7. **Paste-a-URL quick capture.** `components/shell/QuickAddDialog.tsx`, wired in `CommandCenter`. A `paste` event with a single http(s) URL, at lg+, focus not in a field, no dialog open, and single-key shortcuts on, opens a modal: link, autofill status (polite live region), thumbnail, Name (focused) and a List select (lists the viewer can add to: collaborator or owner, unlocked; default current list, then the last list used here (`klect:quick-add-list:<userId>`), then the first). Autofill is `fetchLinkMetadata` started on open; Save waits for it, then posts the same `createBookmark` action with the autofilled description, photos, location, coordinates, video and tags. Toasts "Saved to <list>" with Open, the free-cap toast, or an error. Focus trap, Esc and backdrop close, focus returns. The shortcuts sheet and the Settings switch text mention it. `PaletteList` gained `canAdd`.
8. **Sidebar collapse.** `components/shell/SidebarSync.tsx`: `SidebarSync` (inline script before paint plus effect, `data-sidebar="collapsed"` on `#app-shell`, Cmd/Ctrl+\ at xl only, not covered by the single-key switch) and `SidebarToggle` (under Settings, xl only, `aria-expanded`, `aria-controls`). Stored per viewer as `klect:sidebar:<userId>` via `client-prefs` (try/catch). A Tailwind custom variant `sbx:` ("xl and not collapsed", `globals.css`) replaces `xl:` in `Sidebar.tsx` and `SidebarNav.tsx`, so the collapsed sidebar at xl is exactly the lg rail.
9. **Em dashes in copy.** Chat empty state, list empty state and the Near me permission error now use periods.

### Files

- New: `lib/friends-workspace.ts`, `components/home/AttentionRequestActions.tsx`, `components/shell/QuickAddDialog.tsx`, `components/shell/SidebarSync.tsx`.
- Changed: `lib/sharing.ts`, `components/sharing/MembersPanel.tsx`, `app/(app)/lists/[id]/page.tsx`, `app/(app)/friends/{layout,page}.tsx`, `app/(app)/friends/{dms,requests,pending}/page.tsx`, `components/home/DesktopHome.tsx`, `components/shell/{SidebarNav,Sidebar,AppShell,CommandCenter,ShortcutsSheet}.tsx`, `lib/core/bookmarks.ts`, `lib/actions/bookmarks.ts`, `server/trpc/routers/bookmarks.ts`, `lib/bookmark-mutations.ts`, `lib/toast.ts`, `lib/commands.ts`, `lib/desktop-prefs.ts`, `components/bookmarks/{BookmarkBulkBar,BookmarkSelectable,MoveToListMenu,useBookmarkSelection,ListBookmarks,AllBookmarksResults,NearbyFinder}.tsx/ts`, `components/lists/ListChatLauncher.tsx`, `components/settings/DesktopPrefs.tsx`, `app/globals.css`, `../DESIGN.md`.

### Verification

- `npx tsc --noEmit`, `npm run lint`, `npm run build`: pass. `npx tsx scripts/verify-move-plan.ts`: 11 checks pass. Extension typecheck clean. Built CSS checked: the `sbx:` rules are emitted under the xl media query with the collapsed guard.
- A temporary dev-only harness page (deleted; `find src -iname '*harness*'` returns nothing) rendered the real `SidebarNav`, `SidebarSync`/`SidebarToggle`, `CommandCenter` (with `QuickAddDialog`), `ListBookmarks` (with `BookmarkSelectable`, `BookmarkBulkBar`, `MoveToListMenu`) and `AttentionRequestActions` with fixture data and a placeholder top bar, driven by headless Chrome (playwright-core in a scratch dir). Server action requests were rerouted by their action id to throwaway harness actions returning fixtures (no DB, no auth). Seen at 1440 modern light: Approve toast "You joined Tokyo." and the row hid; a throwing Reject toasted the error and kept the row. Alt+Up on Recipes moved it first with focus kept and "Recipes moved to position 1 of 3." announced, "already first" at the top, four presses posted one `reorderLists` with the correctly merged order; Alt+Down in Shared with me. Single move then Undo: toast "Moved 1 bookmark to Recipes" with Undo, the card hid, Undo posted `moveBookmarks(["b1"],"l1")` and the card came back with "Moved 1 bookmark back"; a refused undo toasted "Couldn't undo: This list is locked..." and the card stayed moved. Bulk bar: Move, Copy to list, Mark visited, Delete, Clear; Mark visited posted `[["b1","b3"],true]` and toasted; Copy menu labelled "Copy 2 bookmarks to list", posted `[["b1","b3"],"l4"]`, toasted with Open and cleared the selection; with a locked card selected Move, Copy and Mark visited were disabled; hover Copy present on editable cards, absent on the locked one. Paste: non-URL text did nothing; a URL with focus on a sidebar link opened Quick add with focus in Name and the current list; autofill filled "Jersey City Coffee"; Tab stayed inside; Esc closed and focus returned; Save to Sam's picks posted the name, toasted "Saved to Sam's picks" with Open and stored the last list; paste in an input and paste with shortcuts off did nothing. Sidebar: 248px, Ctrl+\ to 64px and stored "collapsed"; a reload with every JS file blocked still had `data-sidebar="collapsed"` and 64px; the toggle (keyboard) expanded it; at 1100 the toggle is hidden and Ctrl+\ does nothing; at 390 no sidebar and paste does nothing. Screenshots also checked in pixel light, journal dark and modern dark (hover actions, bulk bar, Quick add). No console errors apart from the intentional throwing action.
- Not verified: anything signed in with real data (the real list page with `?tab=members` and its single DB read, the `/friends` layout and page sharing reads, real move/undo/copy/visited/create round trips and their permission, lock and free-cap refusals from the database, sidebar counts after them, the real `reorderLists` persistence); Firefox and Safari (including Safari's paste event on non-editable focus); screen reader output.

## Switch fix (2026-10-19)

Status: fixed, uncommitted. tsc, lint, build green.

- **Bug.** The "Show only unvisited" switch (`ListBookmarks`) showed a square knob at the right end when off, and when on the knob sat outside the pill (in modern light a white knob on the white page, so it read as no knob and a clipped right edge).
- **Root cause.** The knob was `position: absolute` with `top-1/2` but no `left`. Inside a `<button>` the static position is the centred content box, so the knob started near the middle (computed: 24px from the left edge of a 44px track) and `translate-x-6` pushed it to 46px, 18px past the track. Not the Tailwind translate variables (computed `translate: 24px -50%` was correct) and not the skin overrides; the knob was also never rounded because only the settings switch had a radius rule (`.pref-switch-thumb`). The settings switch had a smaller bug: an 18px travel tuned for the pixel border, so in modern and journal the on knob stopped 4px short of the end.
- **Fix.** One shared `components/ui/Switch.tsx` (native button, `role="switch"`, `aria-checked`, `onCheckedChange`, name via `aria-label` or `aria-labelledby`, other props passed through). Styling is its own `.ui-switch` / `.ui-switch-thumb` rules in `globals.css` (pixel base in `@layer components`, unlayered modern/journal overrides), not `.pixel-box-sm` or `.bg-primary`. The thumb is a flex child moved by `translate`, and its travel is computed from the size variables, so it ends inside the track in every skin. Pixel: square, 3px border and offset shadow, ink thumb off, primary-ink on primary when on, dashed ink focus outline. Modern and journal: pill and round thumb, muted thumb on a lightly tinted track off, primary-ink thumb on primary when on (modern adds the primary gradient), 2px primary focus outline with a 2px offset. No transition under `prefers-reduced-motion`; system colours under `forced-colors`. The old `.pref-switch` rules were removed.
- **Used in.** `ListBookmarks` (Show only unvisited) and `DesktopPrefs` (Keyboard shortcuts). Those were the only two `role="switch"` controls in `src`; the other toggles are checkboxes or `aria-pressed` buttons and were left alone.

### Verification

- A temporary dev-only harness page (deleted; `find src -iname '*harness*'` returns nothing) set `data-theme` on `<html>` itself, so each theme's real skin applied, and rendered the old list switch, the old settings switch and the new `Switch`, off and on, between neighbouring controls. Headless Chrome (playwright-core in a scratch dir) at 1440 in all six themes, with computed styles. Old list switch, every theme: knob left offset 24px off and 46px on (overflowing by 18px), radius 0, which reproduced the report exactly. New switch: knob 5px from the edge off and 5px from the far edge on in pixel (14px thumb, 20px travel), 4px and 4px in modern and journal (16px round thumb, track radius 9999px), nothing outside the track. Keyboard: Tab focus shows the outline (dashed ink in pixel, primary ring in modern light and journal dark), Space and Enter toggle `aria-checked`, as does a click; with reduced motion both transition durations are 0s. Built CSS checked for the travel `calc` and the reduced-motion block.
- Not verified: the real list page and Settings signed in (no login available), so the switch in its real toolbar and any ancestor `overflow` near the focus ring were not seen; Firefox and Safari; screen reader output; forced-colors mode. The modern light on state is a white thumb on the light end of the primary gradient, which is close to 3:1 non-text contrast and worth an eye check.
