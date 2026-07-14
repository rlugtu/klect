import { StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';

import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';

/**
 * The frosted-glass surface shared by the floating status bar (tab screens) and the
 * transparent navigation header (pushed stack screens), so both read as the exact same
 * translucent, blurred strip. It fills its parent — pair it with a fixed-height wrapper
 * (see `FloatingStatusBar`) or hand it to a native-stack `headerBackground` under
 * `headerTransparent`. The native blur needs a device build to render; until then the
 * translucent `bg` tint keeps it reading as glass.
 */
export default function HeaderBlurBackground() {
  const themeName = useTheme().theme;
  const t = THEME_TOKENS[themeName];
  const isDark = themeName.endsWith('DARK');

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: t.border,
          overflow: 'hidden',
          // Tint with the app background (not the lighter panel) so the strip reads as
          // the same color as the content behind it, just frosted. Kept light (~40%
          // light / ~35% dark) so the bar leans on the blur and stays see-through.
          backgroundColor: t.bg + (isDark ? '59' : '66'),
        },
      ]}>
      <BlurView
        intensity={25}
        tint={isDark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
