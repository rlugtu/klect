import { StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';

import { useTheme } from '@/theme/theme-provider';

/**
 * The frosted-glass surface shared by the floating status bar (tab screens) and the
 * transparent navigation header (pushed stack screens), so both read as the exact same
 * translucent strip. It fills its parent — pair it with a fixed-height wrapper (see
 * `FloatingStatusBar`) or hand it to a native-stack `headerBackground` under
 * `headerTransparent`.
 *
 * There is **no solid tint and no bottom border** — the bar is fully transparent and
 * leans entirely on the blur. To avoid the hard edge a plain `BlurView` leaves where it
 * stops, the blur is masked by a top→bottom alpha gradient so it **fades out gradually**
 * (full strength under the status/nav content, tapering to nothing at the bottom). The
 * native blur needs a device build to render; in the simulator the masked area is simply
 * see-through.
 */
export default function HeaderBlurBackground() {
  const themeName = useTheme().theme;
  const isDark = themeName.endsWith('DARK');

  return (
    <MaskedView
      style={StyleSheet.absoluteFill}
      maskElement={
        // Opaque (blur visible) at the top, fading to transparent (no blur) at the
        // bottom — a gradual falloff instead of a hard line. Held near-full for the top
        // ~60% so the content sits on solid glass, then eased away.
        <LinearGradient
          colors={['#000000', '#000000', 'transparent']}
          locations={[0, 0.6, 1]}
          style={StyleSheet.absoluteFill}
        />
      }>
      <BlurView
        intensity={32}
        tint={isDark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
    </MaskedView>
  );
}
