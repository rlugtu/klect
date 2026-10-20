import { Text, View, useWindowDimensions, type AccessibilityActionEvent } from 'react-native';
import Sortable from 'react-native-sortables';
import { Ionicons } from '@expo/vector-icons';

import type { trpc } from '@/client/api';
import LockedBadge, { LOCKED_OPACITY } from '@/components/locked-badge';
import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';
import { cardShadow } from '@/theme/shadows';

// Inferred straight from web's tRPC procedure, same as the Home screen. No hand-written DTOs.
type Membership = Awaited<ReturnType<typeof trpc.lists.mine.query>>[number];

/** Home's screen padding and the grid's gaps, shared so tiles, skeletons and the grid agree. */
export const TILE_SIDE_PADDING = 16;
export const TILE_COLUMN_GAP = 8;
export const TILE_ROW_GAP = 12;

/** The column counts Home's grid can show. 2 is the default; 3 uses the compact tile. */
export type TileColumns = 2 | 3;

// Cover is 4:3 landscape so more rows fit above the fold.
const COVER_ASPECT = 4 / 3;
// The name reserves the same height on every tile so a row lines up whatever the names:
// one line in the two-column grid, two (smaller) lines in the compact three-column grid.
const NAME = {
  regular: { lineHeight: 18, lines: 1 },
  compact: { lineHeight: 15, lines: 2 },
} as const;

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Fixed width of one tile for the given column count. Fixed rather than `flex: 1` so an odd last
 * tile stays one column wide instead of stretching across the row.
 */
export function useTileWidth(columns: TileColumns) {
  const { width } = useWindowDimensions();
  return (width - 2 * TILE_SIDE_PADDING - TILE_COLUMN_GAP * (columns - 1)) / columns;
}

/**
 * Approximate rendered height of a tile, for the loading skeleton: the inset 4:3 cover plus the
 * name block. Kept next to the layout it describes so the two don't drift.
 */
export function tileHeight(width: number, columns: TileColumns) {
  const name = columns === 3 ? NAME.compact : NAME.regular;
  const cover = (width - 2 * 4) / COVER_ASPECT + 2 * 4; // p-1 inset on every side
  return cover + name.lineHeight * name.lines + 8; // pt-0.5 + pb-1.5 around the name
}

// Non-owner lists get a small badge so shared lists read differently from your own (parity with
// web's ListCard). Owned lists show nothing. `icon` is the compact form for the 3-column grid.
const ROLE: Record<
  Membership['role'],
  { label: string; spoken: string; icon: keyof typeof Ionicons.glyphMap } | null
> = {
  OWNER: null,
  COLLABORATOR: { label: 'Collab', spoken: 'collaborator', icon: 'people' },
  VIEWER: { label: 'Viewer', spoken: 'viewer', icon: 'eye' },
};

/** A "Collab" / "Viewer" pill; renders nothing for owned lists. `compact` = icon only. */
export function RoleBadge({ role, compact = false }: { role: Membership['role']; compact?: boolean }) {
  const t = THEME_TOKENS[useTheme().theme];
  const r = ROLE[role];
  if (!r) return null;
  if (compact) {
    return (
      <View
        accessibilityLabel={r.label}
        className="rounded-full border-skin border-border bg-panel px-1.5 py-1">
        <Ionicons name={r.icon} size={10} color={t.muted} />
      </View>
    );
  }
  return (
    <View className="rounded-full border-skin border-border bg-panel px-2 py-0.5">
      <Text className="font-sans-medium text-xs text-muted">{r.label}</Text>
    </View>
  );
}

/** Icon-only Locked pill for the compact tile; same warning tint as `LockedBadge`. */
function CompactLockedBadge() {
  const t = THEME_TOKENS[useTheme().theme];
  return (
    <View
      accessibilityLabel="Locked"
      className="rounded-full border-skin border-border bg-panel px-1.5 py-1">
      <Ionicons name="lock-closed" size={10} color={t.warning} />
    </View>
  );
}

/**
 * Bookmark count (and member count when shared) as a small pill on the cover's bottom-right.
 * Panel fill + ink text so it reads on the emoji backdrop in every theme. The compact tile shows
 * the bookmark number only.
 */
function CountPill({
  bookmarks,
  members,
  compact,
}: {
  bookmarks: number;
  members: number;
  compact: boolean;
}) {
  const t = THEME_TOKENS[useTheme().theme];
  const size = compact ? 9 : 11;
  const text = compact ? 'text-[10px]' : 'text-xs';
  return (
    <View
      className={`flex-row items-center rounded-full border-skin border-border bg-panel ${
        compact ? 'gap-0.5 px-1.5 py-px' : 'gap-1 px-2 py-0.5'
      }`}>
      <Ionicons name="bookmark" size={size} color={t.muted} />
      <Text className={`font-sans-medium ${text} text-ink`}>{bookmarks}</Text>
      {!compact && members > 1 && (
        <>
          <Ionicons name="people" size={size} color={t.muted} style={{ marginLeft: 4 }} />
          <Text className={`font-sans-medium ${text} text-ink`}>{members}</Text>
        </>
      )}
    </View>
  );
}

/**
 * A Home list tile for the `Sortable.Grid`: a 4:3 cover (emoji, status pills top-left, count pill
 * bottom-right) over the name. `columns` picks the regular (2) or compact (3) layout.
 * Presses go through `Sortable.Touchable` (a plain Pressable can fire `onPress` on release after
 * a drag); the grid itself starts the drag on long-press. `onMoveEarlier` / `onMoveLater` are the
 * VoiceOver route to the same reorder path, passed only while reordering is allowed.
 */
export default function ListTile({
  item,
  columns,
  onOpen,
  onMoveEarlier,
  onMoveLater,
}: {
  item: Membership;
  columns: TileColumns;
  onOpen: () => void;
  onMoveEarlier?: () => void;
  onMoveLater?: () => void;
}) {
  const width = useTileWidth(columns);
  const compact = columns === 3;
  const name = compact ? NAME.compact : NAME.regular;
  // Frozen by the free-tier downgrade flow. Locked is read-only, never hidden, so the tile
  // keeps its full surface and stays tappable (and draggable). Only its cover and text dim.
  const locked = item.list.lockedAt != null;
  const dim = locked ? { opacity: LOCKED_OPACITY } : undefined;
  const bookmarkCount = item.list._count.bookmarks;
  const members = item.list._count.memberships;
  const role = ROLE[item.role];
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
      accessibilityLabel={`${item.list.name}, ${plural(bookmarkCount, 'bookmark')}, ${plural(
        members,
        'member',
      )}${role ? `, ${role.spoken}` : ''}${locked ? ', locked, read only' : ''}`}
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
        {/* Cover: its own sub-area so a photo mosaic can replace the emoji later. p-1
            leaves a panel-colored "print border", as on PhotoCard. */}
        <View className="p-1">
          <View className="overflow-hidden rounded-skin-sm" style={dim}>
            <View
              style={{ aspectRatio: COVER_ASPECT }}
              className="items-center justify-center bg-bg">
              <Text className={compact ? 'text-3xl' : 'text-4xl'}>{item.list.icon}</Text>
            </View>
          </View>
          {/* Pills stay at full strength over the dimmed cover: role is a fact about the
              list, Locked must stay legible, and the count is the tile's only meta. (RoleBadge
              renders nothing for OWNER, so it must not be wrapped: a wrapper View would leave
              a stray gap.) */}
          <View
            className={`absolute flex-row flex-wrap gap-1 ${
              compact ? 'left-2 right-2 top-2' : 'left-2.5 right-2.5 top-2.5'
            }`}>
            <RoleBadge role={item.role} compact={compact} />
            {locked && (compact ? <CompactLockedBadge /> : <LockedBadge />)}
          </View>
          <View className={`absolute ${compact ? 'bottom-2 right-2' : 'bottom-2.5 right-2.5'}`}>
            <CountPill bookmarks={bookmarkCount} members={members} compact={compact} />
          </View>
        </View>
        <View className="px-2.5 pb-1.5 pt-0.5" style={dim}>
          <Text
            className={`font-serif text-ink ${compact ? 'text-xs' : 'text-sm'}`}
            numberOfLines={name.lines}
            style={{ lineHeight: name.lineHeight, minHeight: name.lines * name.lineHeight }}>
            {item.list.name}
          </Text>
        </View>
      </View>
    </Sortable.Touchable>
  );
}
