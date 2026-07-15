import { Text } from 'react-native';

// `color` is accepted (and ignored) so existing call sites — which pass each tag's stored
// color — keep working without churn. Tags now render as uniform #hashtags, not colored pills.
type Props = { name: string; color?: string };

/**
 * A tag rendered as a #hashtag — plain accent-colored text, no pill background, no per-tag
 * color. The leading "#" is display-only; tags are stored lowercase and without it.
 */
export default function TagPill({ name }: Props) {
  return (
    <Text className="font-sans text-sm text-accent">#{name.toLowerCase()}</Text>
  );
}
