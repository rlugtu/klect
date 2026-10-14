import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';

import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';

/**
 * A launch-time nudge that points new users at the one setup step the app can't do for them:
 * enabling Klect in the iOS share sheet (see share-help.tsx). iOS-only: the share extension /
 * share-help walkthrough don't exist on Android.
 *
 * Two controls, not three: "Show me how" (which also retires the nudge for good) and a single
 * "Not now" dismiss. The nudge is self-limiting — it counts its own appearances and stops after
 * MAX_SHOWS, so a user who never taps either control still isn't nagged on every cold launch.
 */
/** Set once the user has engaged with the nudge — retires it permanently. */
const ACK_KEY = 'klect.share-nudge-ack';
/** How many cold launches have already shown the nudge. */
const SHOWN_KEY = 'klect.share-nudge-shown';
const MAX_SHOWS = 2;

export default function ShareNudgePopup() {
  const { theme } = useTheme();
  const t = THEME_TOKENS[theme];
  const router = useRouter();

  // `null` = the stored state hasn't been read yet; render nothing until we know, so an
  // already-acknowledged user never sees a flash of the popup.
  const [visible, setVisible] = useState<boolean | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'ios') {
      setVisible(false);
      return;
    }
    Promise.all([
      SecureStore.getItemAsync(ACK_KEY),
      SecureStore.getItemAsync(SHOWN_KEY),
    ])
      .then(([ack, shown]) => {
        const count = Number(shown ?? 0);
        if (ack === 'true' || count >= MAX_SHOWS) {
          setVisible(false);
          return;
        }
        setVisible(true);
        // Count the appearance immediately rather than on dismiss, so force-quitting past the
        // nudge still burns one of its two chances.
        SecureStore.setItemAsync(SHOWN_KEY, String(count + 1)).catch(() => {});
      })
      .catch(() => setVisible(false));
  }, []);

  /** Retire the nudge for good — the user has seen the real walkthrough. */
  function openTutorial() {
    setVisible(false);
    SecureStore.setItemAsync(ACK_KEY, 'true').catch(() => {});
    router.push('/share-help');
  }

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => setVisible(false)}>
      <View
        className="flex-1 items-center justify-center px-8"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <View className="w-full gap-4 rounded-skin border-skin border-border bg-panel p-6">
          <Text className="font-serif text-2xl text-ink">One last step 🎉</Text>

          <Text className="text-base text-muted">
            To get the most out of Klect, let your other apps share links straight to it — no more
            copy-pasting. It takes about a minute to set up.
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Show me how to add Klect to the share sheet"
            onPress={openTutorial}
            style={{ backgroundColor: t.primary }}
            className="flex-row items-center justify-center gap-2 rounded-skin px-4 py-3">
            <Text style={{ color: t.primaryInk }} className="font-sans-semibold text-base">
              Show me how
            </Text>
            <Ionicons name="arrow-forward" size={18} color={t.primaryInk} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Not now"
            onPress={() => setVisible(false)}
            className="items-center rounded-skin border-skin border-border py-3">
            <Text className="font-sans-semibold text-base text-ink">Not now</Text>
          </Pressable>

          <Text className="text-center text-sm text-muted">
            You can find these directions any time under Settings.
          </Text>
        </View>
      </View>
    </Modal>
  );
}
