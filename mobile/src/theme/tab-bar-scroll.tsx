import { createContext, useContext, type ReactNode } from 'react';
import {
  useAnimatedScrollHandler,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

/**
 * Shares scroll state between the tab screens and the custom {@link FloatingTabBar}.
 * Screens feed their scroll offset in via {@link useTabBarScrollHandler}; the bar reads
 * `shrink` (0 = full size, 1 = shrunk) to scale itself as the user scrolls.
 */
type TabBarScroll = {
  shrink: SharedValue<number>;
  lastY: SharedValue<number>;
};

const Ctx = createContext<TabBarScroll | null>(null);

export function TabBarScrollProvider({ children }: { children: ReactNode }) {
  const shrink = useSharedValue(0);
  const lastY = useSharedValue(0);
  return <Ctx.Provider value={{ shrink, lastY }}>{children}</Ctx.Provider>;
}

function useTabBarScroll() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTabBarScroll must be used within a TabBarScrollProvider');
  return ctx;
}

/** The bar's current shrink factor (0 → full, 1 → shrunk). */
export function useTabBarShrink() {
  return useTabBarScroll().shrink;
}

/**
 * Attach the returned handler to a scroll view's `onScroll` (with
 * `scrollEventThrottle={16}`): scrolling down shrinks the bar, scrolling up (or
 * reaching the top) restores it.
 */
export function useTabBarScrollHandler() {
  // Read the context directly (don't throw): this handler is also attached by screens
  // rendered *outside* the tab navigator — e.g. the pushed users/[id] profile via
  // ProfileView — where there's no bar to shrink. Fall back to local shared values so
  // it safely no-ops instead of crashing.
  const ctx = useContext(Ctx);
  const fallbackShrink = useSharedValue(0);
  const fallbackLastY = useSharedValue(0);
  const shrink = ctx?.shrink ?? fallbackShrink;
  const lastY = ctx?.lastY ?? fallbackLastY;
  return useAnimatedScrollHandler({
    onScroll: (e) => {
      const y = e.contentOffset.y;
      if (y <= 0) shrink.value = withTiming(0);
      else if (y - lastY.value > 4) shrink.value = withTiming(1);
      else if (lastY.value - y > 4) shrink.value = withTiming(0);
      lastY.value = y;
    },
  });
}
