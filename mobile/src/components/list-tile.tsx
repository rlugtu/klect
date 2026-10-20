import { useState } from 'react';
import { Text, View, useWindowDimensions, type AccessibilityActionEvent } from 'react-native';
import Sortable from 'react-native-sortables';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import type { trpc } from '@/client/api';
import { LOCKED_OPACITY } from '@/components/locked-badge';
import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';
import { cardShadow } from '@/theme/shadows';

// Inferred straight from web's tRPC procedure, same as the Home screen. No hand-written DTOs.
type Membership = Awaited<ReturnType<typeof trpc.lists.mine.query>>[number];
type Preview = Membership['previews'][number];

/** Home's screen padding and the grid's gaps, shared so tiles, skeletons and the grid agree. */
export const TILE_SIDE_PADDING = 16;
export const TILE_COLUMN_GAP = 8;
export const TILE_ROW_GAP = 12;

/** Home always shows a three-column grid of compact tiles. */
export const TILE_COLUMNS = 3;

// Cover is 4:3 landscape so more rows fit above the fold.
const COVER_ASPECT = 4 / 3;
// The name reserves two lines on every tile so a row lines up whatever the names.
const NAME = { lineHeight: 15, lines: 2 } as const;
// Seam between mosaic cells. The cover's panel fill shows through it, like a print border.
const MOSAIC_GAP = 1.5;

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Fixed width of one tile. Fixed rather than `flex: 1` so an odd last tile stays one column wide
 * instead of stretching across the row.
 */
export function useTileWidth() {
  const { width } = useWindowDimensions();
  return (width - 2 * TILE_SIDE_PADDING - TILE_COLUMN_GAP * (TILE_COLUMNS - 1)) / TILE_COLUMNS;
}

/**
 * Approximate rendered height of a tile, for the loading skeleton: the inset 4:3 cover plus the
 * name block. Kept next to the layout it describes so the two don't drift.
 */
export function tileHeight(width: number) {
  const cover = (width - 2 * 4) / COVER_ASPECT + 2 * 4; // p-1 inset on every side
  return cover + NAME.lineHeight * NAME.lines + 8; // pt-0.5 + pb-1.5 around the name
}

// Non-owner lists get a small icon badge so shared lists read differently from your own (parity
// with web's ListCard). Owned lists show nothing.
const ROLE: Record<
  Membership['role'],
  { label: string; spoken: string; icon: keyof typeof Ionicons.glyphMap } | null
> = {
  OWNER: null,
  COLLABORATOR: { label: 'Collab', spoken: 'collaborator', icon: 'people' },
  VIEWER: { label: 'Viewer', spoken: 'viewer', icon: 'eye' },
};

/** An icon-only "Collab" / "Viewer" pill; renders nothing for owned lists. */
export function RoleBadge({ role }: { role: Membership['role'] }) {
  const t = THEME_TOKENS[useTheme().theme];
  const r = ROLE[role];
  if (!r) return null;
  return (
    <View
      accessibilityLabel={r.label}
      className="rounded-full border-skin border-border bg-panel px-1.5 py-1">
      <Ionicons name={r.icon} size={10} color={t.muted} />
    </View>
  );
}

/** Icon-only Locked pill; same warning tint as `LockedBadge`. */
function LockedPill() {
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
 * Bookmark count as a small pill on the cover's bottom-right. Panel fill + ink text so it reads
 * over a photo or the emoji backdrop in every theme.
 */
function CountPill({ bookmarks }: { bookmarks: number }) {
  const t = THEME_TOKENS[useTheme().theme];
  return (
    <View className="flex-row items-center gap-0.5 rounded-full border-skin border-border bg-panel px-1.5 py-px">
      <Ionicons name="bookmark" size={9} color={t.muted} />
      <Text className="font-sans-medium text-[10px] text-ink">{bookmarks}</Text>
    </View>
  );
}

/**
 * One photo of the mosaic. Walks the bookmark's own photos on load error (hotlinks break), and
 * calls `onDead` once none of them load, so the mosaic can drop this cell and re-lay itself out.
 * `dimmed` fades a bookmark that is locked inside an unlocked list, as web's strip does.
 */
function MosaicCell({
  preview,
  dimmed,
  onDead,
}: {
  preview: Preview;
  dimmed: boolean;
  onDead: () => void;
}) {
  const candidates = [preview.src, ...preview.images.filter((u) => u !== preview.src)];
  const [stage, setStage] = useState(0);
  return (
    <View
      className="flex-1 overflow-hidden"
      style={dimmed ? { opacity: LOCKED_OPACITY } : undefined}>
      <Image
        source={candidates[stage]}
        style={{ width: '100%', height: '100%' }}
        contentFit="cover"
        transition={150}
        accessible={false}
        onError={() => {
          if (stage + 1 < candidates.length) setStage(stage + 1);
          else onDead();
        }}
      />
    </View>
  );
}

/**
 * The tile's 4:3 cover: up to three of the list's newest photos, newest first. Three = the newest
 * fills the left half with the other two stacked on the right; two = side-by-side halves; one =
 * full cover. No photo that loads = the list's emoji on the theme backdrop.
 */
function Cover({
  icon,
  previews,
  listLocked,
}: {
  icon: string;
  previews: Preview[];
  listLocked: boolean;
}) {
  // Cells that failed every candidate. Tied to the preview set it was recorded against, so a
  // refetch with different photos starts clean instead of hiding the wrong cells.
  const signature = previews.map((p) => p.src).join('\n');
  const [failed, setFailed] = useState<{ signature: string; indexes: number[] }>({
    signature,
    indexes: [],
  });
  const dead = failed.signature === signature ? failed.indexes : [];
  const live = previews
    .map((preview, index) => ({ preview, index }))
    .filter(({ index }) => !dead.includes(index))
    .slice(0, 3);

  if (live.length === 0) {
    return (
      <View style={{ aspectRatio: COVER_ASPECT }} className="items-center justify-center bg-bg">
        <Text className="text-3xl">{icon}</Text>
      </View>
    );
  }

  const cell = ({ preview, index }: (typeof live)[number]) => (
    <MosaicCell
      // Keyed by the original slot, so a cell keeps its own fallback stage when a sibling drops.
      key={`${index}:${preview.src}`}
      preview={preview}
      // The whole cover is already dimmed for a locked list; don't stack a second fade.
      dimmed={!listLocked && preview.locked}
      onDead={() =>
        setFailed((prev) => ({
          signature,
          indexes: [...(prev.signature === signature ? prev.indexes : []), index],
        }))
      }
    />
  );

  return (
    <View style={{ aspectRatio: COVER_ASPECT, gap: MOSAIC_GAP }} className="flex-row bg-panel">
      {live.length === 3 ? (
        <>
          {cell(live[0])}
          <View className="flex-1" style={{ gap: MOSAIC_GAP }}>
            {cell(live[1])}
            {cell(live[2])}
          </View>
        </>
      ) : (
        live.map(cell)
      )}
    </View>
  );
}

/**
 * A Home list tile for the `Sortable.Grid`: a 4:3 cover (photo mosaic or emoji, status pills
 * top-left, count pill bottom-right) over a two-line name.
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
        {/* p-1 leaves a panel-colored "print border", as on PhotoCard. */}
        <View className="p-1">
          <View className="overflow-hidden rounded-skin-sm" style={dim}>
            {/* `?? []` keeps the emoji cover if this build ever talks to a server from before
                `previews` existed, instead of crashing the whole grid. */}
            <Cover icon={item.list.icon} previews={item.previews ?? []} listLocked={locked} />
          </View>
          {/* Pills stay at full strength over the dimmed cover: role is a fact about the
              list, Locked must stay legible, and the count is the tile's only meta. (RoleBadge
              renders nothing for OWNER, so it must not be wrapped: a wrapper View would leave
              a stray gap.) */}
          <View className="absolute left-2 right-2 top-2 flex-row flex-wrap gap-1">
            <RoleBadge role={item.role} />
            {locked && <LockedPill />}
          </View>
          <View className="absolute bottom-2 right-2">
            <CountPill bookmarks={bookmarkCount} />
          </View>
        </View>
        <View className="px-2.5 pb-1.5 pt-0.5" style={dim}>
          <Text
            className="font-serif text-xs text-ink"
            numberOfLines={NAME.lines}
            style={{
              lineHeight: NAME.lineHeight,
              minHeight: NAME.lines * NAME.lineHeight,
            }}>
            {item.list.name}
          </Text>
        </View>
      </View>
    </Sortable.Touchable>
  );
}
