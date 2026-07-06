"use client";

import { MotionConfig, motion } from "framer-motion";

/**
 * Wraps every route; re-mounts on navigation so each page fades/slides in.
 * MotionConfig reducedMotion="user" disables animation for users who ask for it.
 */
export default function Template({ children }: { children: React.ReactNode }) {
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
