import { useState } from 'react';
import { Text, View, useWindowDimensions, type AccessibilityActionEvent } from 'react-native';
import Sortable from 'react-native-sortables';
import { Image } from 'expo-image';

import type { trpc } from '@/client/api';
import { LOCKED_OPACITY } from '@/components/locked-badge';
import { LockedPill, RoleBadge, TILE_SIDE_PADDING, plural } from '@/components/list-tile';
import { cardShadow } from '@/theme/shadows';

// Inferred straight from web's tRPC procedure, same as the tile. No hand-written DTOs.
type Membership = Awaited<ReturnType<typeof trpc.lists.mine.query>>[number];
type Preview = Membership['previews'][number];

/** Side of the square thumbnail, and the padding around it. */
const THUMB = 44;
const PAD = 8;

/** Rendered height of one row, for Home's loading skeleton in list mode. */
export const ROW_HEIGHT = THUMB + 2 * PAD;

/**
 * The row's square thumbnail: the list's newest photo, falling through every other photo it has
 * on a load error (hotlinks break), then to the list's emoji on the theme backdrop. Same
 * candidate-walk and same fallback as the tile's mosaic cover, in one cell instead of three.
 */
function Thumb({ icon, previews }: { icon: string; previews: Preview[] }) {
  const candidates = [
    ...new Set(previews.flatMap((p) => [p.src, ...p.images])),
  ].filter(Boolean);
  const [stage, setStage] = useState(0);
  const src = candidates[stage] ?? null;

  if (!src) {
    return (
      <View
        style={{ width: THUMB, height: THUMB }}
        className="items-center justify-center overflow-hidden rounded-skin-sm bg-bg">
        <Text className="text-xl">{icon}</Text>
      </View>
    );
  }
  return (
    <View
      style={{ width: THUMB, height: THUMB }}
      className="overflow-hidden rounded-skin-sm bg-bg">
      <Image
        source={src}
        style={{ width: '100%', height: '100%' }}
        contentFit="cover"
        transition={150}
        accessible={false}
        onError={() => setStage((s) => s + 1)}
      />
    </View>
  );
}

/**
 * The compact full-width alternative to `ListTile` for Home's list view mode: thumbnail, name on
 * one line, a meta line, and the same status pills the tile shows.
 *
 * Reorder behaviour is deliberately identical to the tile's. Presses go through
 * `Sortable.Touchable` (a plain Pressable can fire `onPress` on release after a drag); the grid
 * starts the drag on long-press; `onMoveEarlier` / `onMoveLater` are the VoiceOver route to the
 * same reorder path, passed only while reordering is allowed.
 */
export default function ListRow({
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
  const { width } = useWindowDimensions();
  // One column, so the row spans Home's content width. Fixed rather than `flex: 1` for the same
  // reason the tile's width is: the grid lays its items out, it does not stretch them.
  const rowWidth = width - 2 * TILE_SIDE_PADDING;
  // Frozen by the free-tier downgrade flow. Locked is read-only, never hidden, so the row keeps
  // its full surface and stays tappable (and draggable). Only its thumbnail and text dim.
  const locked = item.list.lockedAt != null;
  const dim = locked ? { opacity: LOCKED_OPACITY } : undefined;
  const bookmarkCount = item.list._count.bookmarks;
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
      accessibilityLabel={`${item.list.name}, ${plural(bookmarkCount, 'bookmark')}, ${plural(
        members,
        'member',
      )}${locked ? ', locked, read only' : ''}`}
      accessibilityHint={reorderable ? 'Double tap and hold to reorder this list' : undefined}
      // `activate` is listed explicitly because the tap is a gesture-handler gesture, which a
      // VoiceOver double tap does not reach.
      accessibilityActions={[
        { name: 'activate' },
        ...(onMoveEarlier ? [{ name: 'moveEarlier', label: 'Move earlier' }] : []),
        ...(onMoveLater ? [{ name: 'moveLater', label: 'Move later' }] : []),
      ]}
      onAccessibilityAction={onAccessibilityAction}
      style={[cardShadow, { width: rowWidth }]}>
      <View
        className="flex-row items-center gap-3 rounded-skin border-skin border-border bg-panel"
        style={{ padding: PAD }}>
        <View style={dim}>
          <Thumb icon={item.list.icon} previews={item.previews ?? []} />
        </View>
        <View className="flex-1" style={dim}>
          <Text className="font-serif text-base text-ink" numberOfLines={1}>
            {item.list.name}
          </Text>
          <Text className="font-sans text-xs text-muted" numberOfLines={1}>
            {plural(bookmarkCount, 'bookmark')}
            {members > 1 ? ` · ${plural(members, 'member')}` : ''}
          </Text>
        </View>
        {/* Pills stay at full strength beside the dimmed content, as on the tile: role is a fact
            about the list and Locked is the one label that must stay legible. */}
        <View className="flex-row items-center gap-1">
          <RoleBadge role={item.role} shared={members > 1} />
          {locked && <LockedPill />}
        </View>
      </View>
    </Sortable.Touchable>
  );
}
