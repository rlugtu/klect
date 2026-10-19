import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { trpc } from '@/client/api';
import { useEntitlements, type EntitlementStatus } from '@/client/entitlements';
import { freeLimitFrom } from '@/client/free-limit';
import LockedBadge from '@/components/locked-badge';
import PaywallView from '@/components/paywall-view';
import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';

/**
 * The downgrade-selection flow: what a lapsed, over-cap account keeps active.
 *
 * Shown by the root layout *instead of* the app, alongside the login and onboarding gates,
 * because an account that owns more than the free tier allows has no coherent state to browse
 * until it resolves. Nothing is ever deleted here — unselected lists and bookmarks get
 * `lockedAt` stamped by `core.selectActiveLists` / `core.selectActiveBookmarks` and come back
 * untouched the moment the user subscribes again.
 *
 * It is a component rather than an `app/` route on purpose: the gate renders before expo-router's
 * navigator mounts, so there is nothing to push a route into (same reason `LoginScreen` and
 * `OnboardingScreen` live in `components/`). The upgrade path is the same reason
 * `PaywallView` is a component — this screen swaps it in inline rather than navigating.
 *
 * It is *also* reachable on purpose, from `app/downgrade.tsx`, which is a thin navigator shell
 * around it exactly like `app/paywall.tsx` is around `PaywallView`. That route is the reclaim
 * path: a free user who locked rows and has since trimmed back under the cap has room to unlock
 * some of them, but `needsSelection` is false by then so the gate no longer offers this screen.
 * The shell passes `onDone`, which is what tells this screen to hand control back instead of
 * waiting to be unmounted by the gate.
 *
 * Two ordered steps, each skipped when it doesn't apply:
 *
 * 1. **Lists.** Only when the account is over the list cap. Commits first, because
 *    `selectActiveBookmarks` refuses ids from a list that is already locked — it operates on
 *    what survived step 1, which is a hard server-side constraint, not a UI preference.
 * 2. **Bookmarks.** Only when, *after* step 1, the account is still over the bookmark cap.
 *    Locking a list takes its bookmarks out of the count, so step 1 often resolves both.
 *
 * Every commit is re-validated server-side against the real caps and real ownership, so this
 * screen is a convenience, not the enforcement.
 */

type Stage = 'lists' | 'bookmarks' | 'paywall';

/**
 * Which of the two states the core status distinguishes this render is for: the same
 * `mode` split web's `DowngradeSelection` makes, so the two platforms ask the same
 * question with the same wording.
 *
 * `downgrade` is over-cap: something has to be locked and the screen is a gate with no
 * way out. `reclaim` is under-cap with locks still held: nothing is owed, so the screen
 * is an offer the user can walk away from. See the "two modes" note in web's
 * `lib/core/active-selection.ts`.
 */
type Mode = 'downgrade' | 'reclaim';

/** A bookmark as `bookmarks.forList` returns it, plus the list it came from. */
type Candidate = {
  id: string;
  name: string;
  listId: string;
  listName: string;
  listIcon: string;
  /** Null = active; a timestamp = locked but still selectable (picking it unlocks it). */
  lockedAt: string | null;
};

/** Per-mode wording. Mirrors the `COPY` table in web's `DowngradeSelection`. */
const COPY = {
  downgrade: {
    lists: { heading: 'Choose what stays', cta: 'Keep these lists' },
    bookmarks: { heading: 'Choose your bookmarks', cta: 'Keep these bookmarks' },
  },
  reclaim: {
    lists: { heading: 'Bring back a locked list', cta: 'Update active lists' },
    bookmarks: { heading: 'Bring back a locked bookmark', cta: 'Update active bookmarks' },
  },
} as const;

/**
 * Active rows before locked ones, otherwise unchanged (`Array.sort` is stable, so each
 * group keeps the server's order). Reclaim mode pre-selects the first `target` rows, and
 * in raw order a locked row could land inside that prefix and push an active one out,
 * which would quietly propose locking something the user never offered to give up.
 */
function activeFirst(
  a: { lockedAt: string | null },
  b: { lockedAt: string | null },
): number {
  return Number(a.lockedAt != null) - Number(b.lockedAt != null);
}

/** Shared full-bleed frame. The gate has no nav header, so this owns the top safe area. */
function Frame({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={{ flex: 1 }} className="bg-bg">
      {children}
    </SafeAreaView>
  );
}

function Centered({ label }: { label: string }) {
  const { theme } = useTheme();
  return (
    <Frame>
      <View className="flex-1 items-center justify-center gap-4 px-8">
        <ActivityIndicator color={THEME_TOKENS[theme].primary} />
        <Text className="text-center text-base text-muted">{label}</Text>
      </View>
    </Frame>
  );
}

/** One selectable row with a check indicator. Shared by both steps. */
function SelectRow({
  title,
  subtitle,
  leading,
  selected,
  disabled,
  locked,
  onPress,
}: {
  title: string;
  subtitle?: string;
  leading?: string;
  selected: boolean;
  disabled?: boolean;
  /** Currently locked. Still selectable; picking it is what unlocks it again. */
  locked?: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const t = THEME_TOKENS[theme];
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled: Boolean(disabled) }}
      accessibilityLabel={[title, subtitle, locked ? 'currently locked' : null]
        .filter(Boolean)
        .join(', ')}
      onPress={onPress}
      disabled={disabled}
      style={{
        borderColor: selected ? t.primary : t.border,
        opacity: disabled && !selected ? 0.4 : 1,
      }}
      className="flex-row items-center gap-3 rounded-skin border-skin bg-panel p-3">
      <View
        style={{
          borderColor: selected ? t.primary : t.border,
          backgroundColor: selected ? t.primary : 'transparent',
        }}
        className="h-6 w-6 items-center justify-center rounded-skin-sm border-skin">
        {selected ? (
          <Text style={{ color: t.primaryInk }} className="text-xs font-semibold">
            ✓
          </Text>
        ) : null}
      </View>
      {leading ? <Text className="text-xl">{leading}</Text> : null}
      <View className="flex-1">
        <View className="flex-row items-center gap-1.5">
          <Text numberOfLines={1} className="shrink font-sans-medium text-base text-ink">
            {title}
          </Text>
          {/* The row's own Pressable supplies the full spoken label above, which
              suppresses children, so this is purely visual here. */}
          {locked ? <LockedBadge /> : null}
        </View>
        {subtitle ? (
          <Text numberOfLines={1} className="text-sm text-muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Sticky footer: the counter, the commit button, and the upgrade escape hatch. */
function StepFooter({
  counter,
  cta,
  ready,
  busy,
  onCommit,
  onUpgrade,
  onLeave,
  error,
}: {
  counter: string;
  cta: string;
  ready: boolean;
  busy: boolean;
  onCommit: () => void;
  onUpgrade: () => void;
  /**
   * Walk away without committing. Supplied in reclaim mode only: that screen is an
   * offer, so it needs a way out. Downgrade mode deliberately has none: the account
   * is over a cap until a choice lands.
   */
  onLeave?: () => void;
  error: string | null;
}) {
  const { theme } = useTheme();
  const t = THEME_TOKENS[theme];
  return (
    <View className="gap-3 border-t border-border bg-bg px-5 pb-2 pt-4">
      {error ? <Text className="text-sm text-danger">{error}</Text> : null}
      <Text className="text-center text-sm text-muted">{counter}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={cta}
        disabled={!ready || busy}
        onPress={onCommit}
        style={{ backgroundColor: t.primary, opacity: !ready || busy ? 0.5 : 1 }}
        className="flex-row items-center justify-center gap-2 rounded-skin p-4">
        {busy ? <ActivityIndicator color={t.primaryInk} size="small" /> : null}
        <Text style={{ color: t.primaryInk }} className="font-sans-semibold text-base">
          {cta}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Upgrade to keep everything"
        disabled={busy}
        onPress={onUpgrade}
        style={{ opacity: busy ? 0.5 : 1 }}
        className="items-center p-2">
        <Text className="font-sans-medium text-base text-primary">
          Upgrade to keep everything
        </Text>
      </Pressable>
      {onLeave ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Leave things as they are"
          disabled={busy}
          onPress={onLeave}
          style={{ opacity: busy ? 0.5 : 1 }}
          className="items-center p-2">
          <Text className="font-sans text-sm text-muted">Leave things as they are</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function DowngradeScreen({
  onDone,
}: {
  /**
   * Called once a commit (or a purchase) has landed and there is nothing left to answer.
   *
   * Omitted by the root layout's gate, which renders this *instead of* the navigator: there
   * the refreshed status flips `needsSelection` and the gate unmounts the screen, so there is
   * nothing to call. Supplied by `app/downgrade.tsx`, which pushed this onto a real navigator
   * and has to pop it back off. The reclaim entry point leaves `needsSelection` false the
   * whole time, so without this the screen would just sit there after a successful commit.
   */
  onDone?: () => void;
}) {
  const { status, refresh, refreshAfterPurchase } = useEntitlements();

  if (!status) return <Centered label="Checking your plan…" />;

  // Mutually exclusive by construction, same derivation web's `/downgrade` page makes:
  // `canReclaim` is defined server-side as *under*-cap, so an account that owes a
  // selection is never also in reclaim mode. Taken off the server flag rather than
  // recomputed from the counts below, so the two platforms can't disagree about which
  // question the user is being asked.
  const mode: Mode = status.needsSelection ? 'downgrade' : 'reclaim';

  // Remount (fresh selection state) if the account's shape or mode changes underneath us.
  return (
    <Selection
      key={`${mode}:${status.lists.length}`}
      mode={mode}
      status={status}
      refresh={refresh}
      onPurchased={refreshAfterPurchase}
      onDone={onDone}
    />
  );
}

function Selection({
  mode,
  status,
  refresh,
  onPurchased,
  onDone,
}: {
  mode: Mode;
  status: EntitlementStatus;
  refresh: () => Promise<EntitlementStatus | null>;
  onPurchased: () => Promise<void>;
  onDone?: () => void;
}) {
  const reclaiming = mode === 'reclaim';

  // Reclaim mode offers the active rows first, so the pre-selection below holds everything
  // already active and spends only the leftover slots on locked rows. Downgrade mode keeps
  // the server's order, which is the order the user's lists are in everywhere else.
  const orderedLists = useMemo(
    () => (reclaiming ? [...status.lists].sort(activeFirst) : status.lists),
    [reclaiming, status.lists],
  );
  const listTarget = Math.min(status.listLimit, orderedLists.length);

  // Which step we're on. Seeded once. In downgrade mode an account only over the bookmark
  // cap never sees the list step. In reclaim mode *any* locked list gives the list step real
  // work: either there is a free slot to put one back into, or the user is at the cap and can
  // swap an active list for a locked one. Deliberately broader than "there is a free slot",
  // because the swap is the only move available to someone whose locks are all lists. Same
  // rule as web's `/downgrade` page.
  const [stage, setStage] = useState<Stage>(() =>
    status.overListLimit ||
    (reclaiming && status.lists.some((list) => list.lockedAt != null))
      ? 'lists'
      : 'bookmarks',
  );
  /** Stage to return to when the inline paywall is dismissed. */
  const [stageBeforePaywall, setStageBeforePaywall] = useState<Stage>('lists');
  const [unlocking, setUnlocking] = useState(false);

  // Reclaim mode starts with a valid answer already filled in (the active rows, then as
  // many locked ones as there is room for), so bringing something back is one tap rather
  // than re-ticking every list the user already has. Downgrade mode starts empty on
  // purpose: there, every unticked row is about to be locked, so the choice must be made
  // deliberately and nothing should be pre-chosen for the user.
  const [selectedLists, setSelectedLists] = useState<string[]>(() =>
    reclaiming ? orderedLists.slice(0, listTarget).map((list) => list.id) : [],
  );
  const [selectedBookmarks, setSelectedBookmarks] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [candidatesFailed, setCandidatesFailed] = useState(false);

  const bookmarkTarget = Math.min(status.bookmarkLimit, candidates?.length ?? 0);
  const copy = COPY[mode];

  // Lists still active after any commit so far — the only lists whose bookmarks the server
  // will accept in step 2.
  const activeLists = useMemo(
    () => status.lists.filter((list) => list.lockedAt === null),
    [status.lists],
  );
  const activeKey = activeLists.map((list) => list.id).join(',');

  const loadCandidates = useCallback(async () => {
    setCandidatesFailed(false);
    setCandidates(null);
    try {
      const perList = await Promise.all(
        activeLists.map(async (list) => {
          const bookmarks = await trpc.bookmarks.forList.query({ listId: list.id });
          return bookmarks.map<Candidate>((bookmark) => ({
            id: bookmark.id,
            name: bookmark.name,
            listId: list.id,
            listName: list.name,
            listIcon: list.icon,
            lockedAt: bookmark.lockedAt,
          }));
        }),
      );
      const flat = perList.flat();
      const ordered = reclaiming ? flat.sort(activeFirst) : flat;
      setCandidates(ordered);
      // Same one-tap default as the list step, applied here as soon as the candidates
      // exist (they can't be known before the list commit; see selectActiveBookmarks).
      if (reclaiming) {
        setSelectedBookmarks(
          ordered
            .slice(0, Math.min(status.bookmarkLimit, ordered.length))
            .map((bookmark) => bookmark.id),
        );
      }
    } catch {
      setCandidatesFailed(true);
    }
    // `activeLists` is derived from `status`, which this screen refreshes between steps;
    // keying the effect below on the id string keeps a background status poll from
    // re-fetching (and wiping the user's in-progress selection) when nothing changed.
  }, [activeLists, reclaiming, status.bookmarkLimit]);

  useEffect(() => {
    if (stage !== 'bookmarks') return;
    loadCandidates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, activeKey]);

  function toggle(id: string, limit: number, setter: typeof setSelectedLists) {
    setError(null);
    setter((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      // Hard-stop at the cap rather than silently trimming on submit, so the count on screen
      // is always the count that gets sent.
      if (prev.length >= limit) return prev;
      return [...prev, id];
    });
  }

  async function commitLists() {
    setBusy(true);
    setError(null);
    try {
      await trpc.entitlements.selectActiveLists.mutate({ listIds: selectedLists });
      const next = await refresh();
      // Locking lists takes their bookmarks out of the count, so step 2 is often unnecessary.
      // A null `next` means the refresh failed; fall through to the bookmark step rather than
      // declaring victory on a status we couldn't read.
      if (next && !next.needsSelection) {
        onDone?.(); // Gate unmounts this screen; a route shell pops it.
        return;
      }
      setStage('bookmarks');
    } catch (e) {
      setError(messageFor(e, 'Could not save your lists.'));
    } finally {
      setBusy(false);
    }
  }

  async function commitBookmarks() {
    setBusy(true);
    setError(null);
    try {
      await trpc.entitlements.selectActiveBookmarks.mutate({
        bookmarkIds: selectedBookmarks,
      });
      await refresh(); // Clears `needsSelection`; the gate then unmounts this screen.
      onDone?.(); // No-op under the gate; pops the screen when it was pushed as a route.
    } catch (e) {
      setError(messageFor(e, 'Could not save your bookmarks.'));
    } finally {
      setBusy(false);
    }
  }

  function openPaywall() {
    setStageBeforePaywall(stage === 'paywall' ? stageBeforePaywall : stage);
    setStage('paywall');
  }

  if (unlocking) return <Centered label="Unlocking Klect Pro…" />;

  if (stage === 'paywall') {
    return (
      <Frame>
        <PaywallView
          reason="Klect Pro keeps every list and bookmark you already have, with nothing to pick."
          dismissLabel="Choose what to keep instead"
          onDismiss={() => setStage(stageBeforePaywall)}
          onEntitled={async () => {
            setUnlocking(true);
            // The webhook clears every lock server-side on re-subscribe; once our own status
            // says pro, `needsSelection` is false and the gate drops this screen entirely.
            await onPurchased();
            setUnlocking(false);
            // Pro clears every lock server-side, so there is nothing left to select.
            onDone?.();
          }}
        />
      </Frame>
    );
  }

  if (stage === 'lists') {
    const over = status.activeListCount - status.listLimit;
    return (
      <Frame>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
          <View className="gap-2">
            <Text className="font-serif text-3xl text-ink">{copy.lists.heading}</Text>
            <Text className="text-base text-muted">
              {reclaiming
                ? `You made room. Free accounts keep ${status.listLimit} lists active and you have ${status.activeListCount}, so you can bring locked lists back. Pick the ${listTarget} you want active.`
                : `Your subscription ended and you have ${over} ${over === 1 ? 'list' : 'lists'} more than the free plan keeps active. Pick the ${listTarget} to keep.`}{' '}
              Anything you leave out is locked, not deleted, and comes back the moment you
              subscribe again.
            </Text>
          </View>
          <View className="gap-2">
            {orderedLists.map((list) => (
              <SelectRow
                key={list.id}
                leading={list.icon || '🔖'}
                title={list.name}
                subtitle={subtitleFor(list.bookmarkCount, list.lockedBookmarkCount)}
                selected={selectedLists.includes(list.id)}
                locked={list.lockedAt != null}
                disabled={
                  !selectedLists.includes(list.id) && selectedLists.length >= listTarget
                }
                onPress={() => toggle(list.id, listTarget, setSelectedLists)}
              />
            ))}
          </View>
        </ScrollView>
        <StepFooter
          counter={`${selectedLists.length} of ${listTarget} lists selected`}
          cta={copy.lists.cta}
          ready={selectedLists.length === listTarget}
          busy={busy}
          error={error}
          onCommit={commitLists}
          onUpgrade={openPaywall}
          onLeave={reclaiming ? onDone : undefined}
        />
      </Frame>
    );
  }

  // Bookmarks step.
  if (candidatesFailed) {
    return (
      <Frame>
        <View className="flex-1 items-center justify-center gap-4 px-8">
          <Text className="text-center text-base text-muted">
            Could not load your bookmarks. Check your connection and try again.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Try again"
            onPress={loadCandidates}
            className="rounded-skin border-skin border-border px-6 py-3">
            <Text className="font-sans-medium text-base text-primary">Try again</Text>
          </Pressable>
        </View>
      </Frame>
    );
  }

  if (!candidates) return <Centered label="Loading your bookmarks…" />;

  const overBookmarks = candidates.length - status.bookmarkLimit;
  return (
    <Frame>
      <FlatList
        data={candidates}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 20, gap: 8 }}
        ListHeaderComponent={
          <View className="gap-2 pb-2">
            <Text className="font-serif text-3xl text-ink">{copy.bookmarks.heading}</Text>
            <Text className="text-base text-muted">
              {reclaiming
                ? `You made room. Free accounts keep ${status.bookmarkLimit} bookmarks active and you have ${status.activeBookmarkCount}, so you can bring locked bookmarks back. Pick the ${bookmarkTarget} you want active. The rest stay saved and locked.`
                : overBookmarks > 0
                  ? `That leaves ${overBookmarks} ${overBookmarks === 1 ? 'bookmark' : 'bookmarks'} over the free plan. Pick the ${bookmarkTarget} to keep active — the rest stay saved and locked.`
                  : `Pick the ${bookmarkTarget} bookmarks to keep active. The rest stay saved and locked.`}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <SelectRow
            leading={item.listIcon || '🔖'}
            title={item.name}
            subtitle={item.listName}
            selected={selectedBookmarks.includes(item.id)}
            locked={item.lockedAt != null}
            disabled={
              !selectedBookmarks.includes(item.id) &&
              selectedBookmarks.length >= bookmarkTarget
            }
            onPress={() => toggle(item.id, bookmarkTarget, setSelectedBookmarks)}
          />
        )}
      />
      <StepFooter
        counter={`${selectedBookmarks.length} of ${bookmarkTarget} bookmarks selected`}
        cta={copy.bookmarks.cta}
        ready={selectedBookmarks.length === bookmarkTarget}
        busy={busy}
        error={error}
        onCommit={commitBookmarks}
        onUpgrade={openPaywall}
        onLeave={reclaiming ? onDone : undefined}
      />
    </Frame>
  );
}

/** "12 bookmarks · 3 locked" for a list row. */
function subtitleFor(active: number, locked: number): string {
  const head = `${active} ${active === 1 ? 'bookmark' : 'bookmarks'}`;
  return locked > 0 ? `${head} · ${locked} locked` : head;
}

/**
 * Message for a failed commit. A `FreeLimitError` here means the server re-validated the
 * selection and rejected it (a tampered or stale client), so its copy is the useful one.
 */
function messageFor(e: unknown, fallback: string): string {
  const cap = freeLimitFrom(e);
  if (cap) return cap.message;
  return e instanceof Error && e.message ? e.message : fallback;
}
