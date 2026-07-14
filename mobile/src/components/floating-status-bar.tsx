import { StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';

/**
 * A frosted-glass overlay pinned to the top of a tab screen, spanning the status-bar
 * safe area. Mirrors the floating tab bar so screen content scrolls *under* a
 * translucent, blurred status bar instead of a solid bg-colored strip. The native
 * blur needs a device build to render; until then the translucent `panel` fallback
 * keeps it reading as glass. Pair with a `SafeAreaView` that drops its `top` edge and
 * a scroll container padded by the top inset.
 */
export default function FloatingStatusBar() {
  const themeName = useTheme().theme;
  const t = THEME_TOKENS[themeName];
  const insets = useSafeAreaInsets();
  const isDark = themeName.endsWith('DARK');

  return (
    <View
      pointerEvents="none"
      style={[
        styles.container,
        {
          height: insets.top,
          borderBottomColor: t.border,
          backgroundColor: t.panel + (isDark ? '99' : 'B3'),
        },
      ]}>
      <BlurView
        intensity={40}
        tint={isDark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    zIndex: 10,
  },
});
