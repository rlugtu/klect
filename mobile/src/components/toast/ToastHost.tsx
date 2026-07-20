/**
 * Global toast overlay (mobile). Mounted once in the root layout, it subscribes
 * to the `toast` store (client/toast.ts) and renders a stack of auto-dismissing
 * cards anchored below the notch (top). Each card:
 *  - shows a shrinking progress bar over its lifetime (the countdown),
 *  - pauses that countdown while pressed-and-held (so it can be read),
 *  - can be flicked up to dismiss,
 *  - matches the active theme via semantic classes + THEME_TOKENS colors.
 */
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Reanimated, {
  cancelAnimation,
  FadeInUp,
  FadeOutUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS, type TokenName } from '@/theme/tokens';
import { subscribe, dismiss, type Toast, type ToastType } from '@/client/toast';

const ICON: Record<ToastType, keyof typeof Ionicons.glyphMap> = {
  success: 'checkmark-circle',
  error: 'close-circle',
  info: 'information-circle',
  warning: 'warning',
};

/** Which theme token colors each toast type's icon + progress bar. */
const COLOR: Record<ToastType, TokenName> = {
  success: 'success',
  error: 'danger',
  info: 'primary',
  warning: 'warning',
};

export default function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const insets = useSafeAreaInsets();

  useEffect(() => subscribe(setToasts), []);

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', top: insets.top + 8, left: 0, right: 0 }}
      className="items-center gap-2 px-3">
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} />
      ))}
    </View>
  );
}

function ToastCard({ toast: t }: { toast: Toast }) {
  const { theme } = useTheme();
  const tokens = THEME_TOKENS[theme];
  const tint = tokens[COLOR[t.type]];

  // Countdown: progress 1 → 0 over the toast's lifetime, mirrored by a JS timer
  // that dismisses at the end. Both are pausable so a press-and-hold can freeze
  // the toast while the user reads it.
  const progress = useSharedValue(1);
  const translateY = useSharedValue(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remaining = useRef(t.duration);

  const clearTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const resume = () => {
    clearTimer();
    progress.value = withTiming(0, { duration: remaining.current });
    timer.current = setTimeout(() => dismiss(t.id), remaining.current);
  };

  const pause = () => {
    clearTimer();
    cancelAnimation(progress);
    remaining.current = Math.max(0, progress.value * t.duration);
  };

  useEffect(() => {
    resume();
    return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const barStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: progress.value }],
  }));
  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: 1 + Math.min(0, translateY.value / 60),
  }));

  // Flick up to dismiss; anything shorter springs back.
  const pan = Gesture.Pan()
    .onChange((e) => {
      if (e.translationY < 0) translateY.value = e.translationY;
    })
    .onEnd((e) => {
      if (e.translationY < -30) {
        translateY.value = withTiming(-120, { duration: 140 });
        scheduleOnRN(dismiss, t.id);
      } else {
        translateY.value = withSpring(0, { damping: 18, stiffness: 220 });
      }
    });

  return (
    <GestureDetector gesture={pan}>
      <Reanimated.View
        entering={FadeInUp.springify().damping(18)}
        exiting={FadeOutUp.duration(160)}
        style={[cardStyle, { width: '100%', maxWidth: 440 }]}
        className="self-center overflow-hidden rounded-skin border-skin border-border bg-panel">
        <Pressable
          onPressIn={pause}
          onPressOut={resume}
          accessibilityLiveRegion={t.type === 'error' ? 'assertive' : 'polite'}
          className="flex-row items-center gap-2.5 px-3.5 py-3">
          <Ionicons name={ICON[t.type]} size={20} color={tint} />
          <Text className="flex-1 text-sm text-ink font-sans" numberOfLines={3}>
            {t.message}
          </Text>
          {t.action && (
            <Pressable
              hitSlop={8}
              onPress={() => {
                t.action?.onPress();
                dismiss(t.id);
              }}>
              <Text className="text-sm font-sans-semibold" style={{ color: tint }}>
                {t.action.label}
              </Text>
            </Pressable>
          )}
          <Pressable hitSlop={8} onPress={() => dismiss(t.id)} accessibilityLabel="Dismiss">
            <Ionicons name="close" size={16} color={tokens.muted} />
          </Pressable>
        </Pressable>
        {/* Countdown bar, left-anchored so it shrinks toward the end. */}
        <Reanimated.View
          style={[
            barStyle,
            {
              height: 3,
              backgroundColor: tint,
              transformOrigin: 'left',
            },
          ]}
        />
      </Reanimated.View>
    </GestureDetector>
  );
}
