import { Pressable, Text } from 'react-native';

/**
 * Toggle pill for a bookmark's visited flag. Shared by the detail view and the
 * add/edit form. `size` defaults to 'sm' (the form); the detail view uses 'md' to
 * give the pill more presence next to the rating. Interactive only when `onToggle`
 * is given. Without it the pill is a read-only state badge (a viewer's view).
 */
export default function VisitedPill({
  visited,
  onToggle,
  size = 'sm',
}: {
  visited: boolean;
  onToggle?: () => void;
  size?: 'sm' | 'md';
}) {
  const interactive = typeof onToggle === 'function';

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel="Visited"
      accessibilityState={{ checked: visited, disabled: !interactive }}
      disabled={!interactive}
      onPress={onToggle}
      className={`rounded-skin-sm ${size === 'md' ? 'px-3 py-1' : 'px-2.5 py-0.5'} ${visited ? 'bg-success' : 'border-skin border-border'}`}>
      <Text
        className={`font-sans ${size === 'md' ? 'text-sm' : 'text-xs'} ${visited ? 'text-primary-ink' : 'text-muted'}`}>
        {visited ? 'Visited' : interactive ? 'Mark visited' : 'Not visited'}
      </Text>
    </Pressable>
  );
}
