import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';

import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';

/**
 * A launch-time nudge that points new users at the one setup step the app can't do for them:
 * enabling Klect in the iOS share sheet (see share-help.tsx). It shows on every launch until the
 * user acknowledges it via the toggle — turning the toggle on persists the acknowledgement
 * immediately (and turning it back off clears it); the close button only dismisses for this
 * session. iOS-only: the share extension / share-help walkthrough don't exist on Android.
 */
const ACK_KEY = 'klect.share-nudge-ack';

export default function ShareNudgePopup() {
  const { theme } = useTheme();
  const t = THEME_TOKENS[theme];
  const router = useRouter();

  // `null` = the stored ack hasn't been read yet; render nothing until we know, so an
  // already-acknowledged user never sees a flash of the popup.
  const [visible, setVisible] = useState<boolean | null>(null);
  const [ack, setAck] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') {
      setVisible(false);
      return;
    }
    SecureStore.getItemAsync(ACK_KEY)
      .then((v) => setVisible(v !== 'true'))
      .catch(() => setVisible(true));
  }, []);

  function toggleAck(next: boolean) {
    setAck(next);
    if (next) SecureStore.setItemAsync(ACK_KEY, 'true').catch(() => {});
    else SecureStore.deleteItemAsync(ACK_KEY).catch(() => {});
  }

  function openTutorial() {
    setVisible(false);
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
            onPress={openTutorial}
            style={{ backgroundColor: t.primary }}
            className="flex-row items-center justify-center gap-2 rounded-skin px-4 py-3">
            <Text style={{ color: t.primaryInk }} className="font-sans-semibold text-base">
              Show me how
            </Text>
            <Ionicons name="arrow-forward" size={18} color={t.primaryInk} />
          </Pressable>

          <Text className="text-sm text-muted">
            You can find these same directions any time under Settings.
          </Text>

          <View className="flex-row items-center justify-between gap-3 border-t border-border pt-4">
            <Text className="flex-1 text-sm text-ink">
              Got it — don&apos;t remind me again.
            </Text>
            <Switch
              value={ack}
              onValueChange={toggleAck}
              trackColor={{ true: t.primary, false: `${t.muted}66` }}
              ios_backgroundColor={`${t.muted}66`}
            />
          </View>

          <Pressable
            onPress={() => setVisible(false)}
            className="items-center rounded-skin border-skin border-border py-3">
            <Text className="font-sans-semibold text-base text-ink">
              {ack ? 'All set!' : 'Remind me again later'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
