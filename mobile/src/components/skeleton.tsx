import { useEffect } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';

/** A minimal pulsing placeholder block for loading states. */
export default function Skeleton({ height = 48 }: { height?: number }) {
  const t = THEME_TOKENS[useTheme().theme];
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.85, { duration: 700 }), -1, true);
  }, [opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[{ height, backgroundColor: t.panel, borderRadius: 12 }, style]}
    />
  );
}
