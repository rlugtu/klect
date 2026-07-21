import { Pressable, Text } from 'react-native';

/**
 * Toggle pill for a bookmark's visited flag. Shared by the detail view and the
 * add/edit form so the two surfaces match.
 */
export default function VisitedPill({
  visited,
  onToggle,
}: {
  visited: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: visited }}
      onPress={onToggle}
      className={`rounded-skin-sm px-2.5 py-0.5 ${visited ? 'bg-success' : 'border-skin border-border'}`}>
      <Text
        className={`font-sans text-xs ${visited ? 'text-primary-ink' : 'text-muted'}`}>
        {visited ? 'Visited' : 'Mark visited'}
      </Text>
    </Pressable>
  );
}
