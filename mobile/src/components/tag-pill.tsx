import { Text, View } from 'react-native';

type Props = { name: string; color: string };

/** Per-tag colored pill — fully rounded, lowercase label, no border (Journal). */
export default function TagPill({ name, color }: Props) {
  return (
    <View
      style={{ backgroundColor: color }}
      className="rounded-skin-sm px-2.5 py-0.5">
      <Text className="font-sans text-xs text-ink">{name.toLowerCase()}</Text>
    </View>
  );
}
