"use client";

import { MotionConfig, motion } from "framer-motion";

/**
 * Per-page fade for the signed-in app. It sits below the (app) layout, so on
 * desktop only the content column re-animates on navigation while the sidebar
 * and top bar stay mounted and still. On mobile there is no visible shell, so
 * this reproduces exactly the fade the root template used to give every page.
 *
 * The root template still wraps this group as a whole; its key is the "(app)"
 * segment, which does not change between app pages, so it does not remount (and
 * re-fade the shell) on in-app navigation.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}
