import { Text, View, useWindowDimensions, type AccessibilityActionEvent } from 'react-native';
import Sortable from 'react-native-sortables';

import type { trpc } from '@/client/api';
import LockedBadge, { LOCKED_OPACITY } from '@/components/locked-badge';
import { cardShadow } from '@/theme/shadows';

// Inferred straight from web's tRPC procedure, same as the Home screen. No hand-written DTOs.
type Membership = Awaited<ReturnType<typeof trpc.lists.mine.query>>[number];

/** Home's screen padding and the grid's gaps, shared so tiles, skeletons and the grid agree. */
export const TILE_SIDE_PADDING = 16;
export const TILE_COLUMN_GAP = 12;
export const TILE_ROW_GAP = 16;

// The name always reserves two lines so tiles in one row line up whatever their names.
const NAME_LINE_HEIGHT = 21;

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Fixed width of one tile in the two-column grid. Fixed rather than `flex: 1` so an odd last
 * tile stays half width instead of stretching across the row.
 */
export function useTileWidth() {
  const { width } = useWindowDimensions();
  return (width - 2 * TILE_SIDE_PADDING - TILE_COLUMN_GAP) / 2;
}

// Non-owner lists get a small badge so shared lists read differently from your own (parity with
// web's ListCard). Owned lists show nothing.
const ROLE_LABEL: Record<Membership['role'], string | null> = {
  OWNER: null,
  COLLABORATOR: 'Collab',
  VIEWER: 'Viewer',
};

/** A "Collab" / "Viewer" pill; renders nothing for owned lists. */
export function RoleBadge({ role }: { role: Membership['role'] }) {
  const label = ROLE_LABEL[role];
  if (!label) return null;
  return (
    <View className="rounded-full border-skin border-border bg-panel px-2 py-0.5">
      <Text className="font-sans-medium text-xs text-muted">{label}</Text>
    </View>
  );
}

/**
 * A Home list tile for the two-column `Sortable.Grid`: a square cover over the name and counts.
 * Presses go through `Sortable.Touchable` (a plain Pressable can fire `onPress` on release after
 * a drag); the grid itself starts the drag on long-press. `onMoveEarlier` / `onMoveLater` are the
 * VoiceOver route to the same reorder path, passed only while reordering is allowed.
 */
export default function ListTile({
  item,
  onOpen,
  onMoveEarlier,
  onMoveLater,
}: {
  item: Membership;
  onOpen: () => void;
  onMoveEarlier?: () => void;
  onMoveLater?: () => void;
}) {
  const width = useTileWidth();
  // Frozen by the free-tier downgrade flow. Locked is read-only, never hidden, so the tile
  // keeps its full surface and stays tappable (and draggable). Only its cover and text dim.
  const locked = item.list.lockedAt != null;
  const dim = locked ? { opacity: LOCKED_OPACITY } : undefined;
  const bookmarks = plural(item.list._count.bookmarks, 'bookmark');
  const members = item.list._count.memberships;
  const reorderable = onMoveEarlier != null || onMoveLater != null;

  function onAccessibilityAction(e: AccessibilityActionEvent) {
    if (e.nativeEvent.actionName === 'activate') onOpen();
    else if (e.nativeEvent.actionName === 'moveEarlier') onMoveEarlier?.();
    else if (e.nativeEvent.actionName === 'moveLater') onMoveLater?.();
  }

  return (
    <Sortable.Touchable
      onTap={onOpen}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${item.list.name}, ${bookmarks}, ${plural(members, 'member')}${
        locked ? ', locked, read only' : ''
      }`}
      accessibilityHint={reorderable ? 'Double tap and hold to reorder this list' : undefined}
      // `activate` is listed explicitly because the tap is a gesture-handler gesture, which a
      // VoiceOver double tap does not reach.
      accessibilityActions={[
        { name: 'activate' },
        ...(onMoveEarlier ? [{ name: 'moveEarlier', label: 'Move earlier' }] : []),
        ...(onMoveLater ? [{ name: 'moveLater', label: 'Move later' }] : []),
      ]}
      onAccessibilityAction={onAccessibilityAction}
      style={[cardShadow, { width }]}>
      <View className="rounded-skin border-skin border-border bg-panel">
        {/* Cover: its own sub-area so a photo mosaic can replace the emoji later. p-1.5
            leaves a panel-colored "print border", as on PhotoCard. */}
        <View className="p-1.5">
          <View className="overflow-hidden rounded-skin-sm" style={dim}>
            <View style={{ aspectRatio: 1 }} className="items-center justify-center bg-bg">
              <Text className="text-5xl">{item.list.icon}</Text>
            </View>
          </View>
          {/* Badges stay at full strength over the dimmed cover: role is a fact about the
              list and Locked must stay legible. (RoleBadge renders nothing for OWNER, so it
              must not be wrapped: a wrapper View would leave a stray gap.) */}
          <View className="absolute left-3 right-3 top-3 flex-row flex-wrap gap-1">
            <RoleBadge role={item.role} />
            {locked && <LockedBadge />}
          </View>
        </View>
        <View className="gap-0.5 px-3 pb-3 pt-1" style={dim}>
          <Text
            className="font-serif text-base text-ink"
            numberOfLines={2}
            style={{ lineHeight: NAME_LINE_HEIGHT, minHeight: 2 * NAME_LINE_HEIGHT }}>
            {item.list.name}
          </Text>
          <Text className="font-sans text-xs text-muted" numberOfLines={1}>
            {bookmarks}
            {members > 1 ? ` · ${plural(members, 'member')}` : ''}
          </Text>
        </View>
      </View>
    </Sortable.Touchable>
  );
}
