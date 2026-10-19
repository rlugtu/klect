import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';

/**
 * Opacity a locked row's own content drops to. Applied to the text/photo a locked
 * list or bookmark carries, never to the badge itself (a dimmed "Locked" label is
 * the one thing that must stay legible) and never to the card surface, so a locked
 * row still reads as a solid, tappable card.
 */
export const LOCKED_OPACITY = 0.5;

/**
 * "Locked" status pill for a list or bookmark the free-tier downgrade flow froze
 * (`lockedAt` non-null on the row, set by `core.selectActiveLists` /
 * `core.selectActiveBookmarks`).
 *
 * Deliberately the same geometry as the Collab/Viewer role badge on the Home list
 * cards (fully rounded, bordered, panel fill, xs medium label), so the two read as
 * one family of status pills. What sets it apart is the lock glyph and the warning
 * tint, since "locked" is a state the user is expected to act on and a role is not.
 *
 * Status only, never pressable: locked means read-only, not hidden, so whatever row
 * this sits on stays tappable through to its read-only contents.
 */
export default function LockedBadge() {
  const t = THEME_TOKENS[useTheme().theme];
  // Left readable by VoiceOver on purpose. The Home list card wraps it in a
  // Pressable that carries its own full accessibilityLabel (which already says
  // "locked, read only", and suppresses children), but the in-list bookmark card
  // has no such label and collects its children instead, so hiding this would
  // drop the only spoken cue there.
  return (
    <View className="flex-row items-center gap-1 rounded-full border-skin border-border bg-panel px-2 py-0.5">
      <Ionicons name="lock-closed" size={11} color={t.warning} />
      <Text className="font-sans-medium text-xs" style={{ color: t.warning }}>
        Locked
      </Text>
    </View>
  );
}

/**
 * Full-width explainer banner for a locked list or bookmark, shown once near the top
 * of its detail screen. Mirrors the "Public list · view only" notice on the list
 * screen (bordered row, small icon, muted copy) so the two read-only states look
 * alike, and echoes the wording of `LockedError` in web's `core/lists.ts` so the
 * banner and any server refusal say the same thing.
 */
export function LockedNotice({ kind }: { kind: 'list' | 'bookmark' }) {
  const t = THEME_TOKENS[useTheme().theme];
  const subject = kind === 'list' ? 'This list is locked' : 'This bookmark is locked';
  return (
    <View className="flex-row items-center gap-1.5 rounded-skin border-skin border-border px-3 py-2">
      <Ionicons name="lock-closed-outline" size={14} color={t.warning} />
      <Text className="flex-1 font-sans text-sm text-muted">
        {subject} · read only. Upgrade or free up space to edit it.
      </Text>
    </View>
  );
}

/**
 * Dismissible prompt to reopen the downgrade-selection screen and bring locked rows back.
 *
 * A free user who locked content and has since trimmed their active content back under the cap
 * has room to unlock some of it, but the root layout's gate only offers the selection screen
 * while `needsSelection` holds, and by then it doesn't, so there was no way back to it. This is
 * that entry point, pushing the `/downgrade` route.
 *
 * Deliberately a prompt and not a gate: reclaiming is optional, the account is already coherent,
 * and blocking the app over something the user doesn't owe would be hostile. Hence the dismiss.
 *
 * Shown only when the server reports `entitlements.status.canReclaim`. Eligibility is never
 * recomputed here from counts: one authority (web's `core/active-selection.ts`) decides, so web
 * and mobile cannot disagree about whether there is anything to reclaim.
 *
 * Same bordered-panel geometry as the Home list cards it sits above, with the lock-open glyph in
 * the warning tint `LockedBadge` uses, so it reads as the counterpart to the "Locked" pills
 * below it rather than a new kind of surface.
 */
export function ReclaimBanner({
  onReview,
  onDismiss,
}: {
  onReview: () => void;
  onDismiss: () => void;
}) {
  const t = THEME_TOKENS[useTheme().theme];
  return (
    <View className="flex-row items-center gap-2.5 rounded-skin border-skin border-border bg-panel p-3">
      <Ionicons name="lock-open-outline" size={16} color={t.warning} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="You have room to unlock items. Choose what to unlock."
        onPress={onReview}
        className="flex-1">
        <Text className="font-sans text-sm text-muted">
          You have room to unlock some of your locked items.
        </Text>
        <Text className="font-sans-medium text-sm text-primary">Choose what to unlock</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss the unlock reminder"
        hitSlop={10}
        onPress={onDismiss}>
        <Ionicons name="close" size={16} color={t.muted} />
      </Pressable>
    </View>
  );
}
