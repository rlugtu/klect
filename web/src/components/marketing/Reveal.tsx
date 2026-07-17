"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Scroll-reveal wrapper for the landing page feature sections — fades + slides
 * in the first time the block enters the viewport. Mirrors the IntersectionObserver
 * reveal from the source design, but built on Framer Motion (already a dep).
 */
export function Reveal({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.7, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
