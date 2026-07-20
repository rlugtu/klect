"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Info, XCircle, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  subscribe,
  dismiss,
  toast,
  type Toast,
  type ToastType,
} from "@/lib/toast";
import { consumeFlashToast } from "@/lib/toast-flash";

/** Per-type icon + the token color class used on the icon and progress bar. */
const TYPE_META: Record<
  ToastType,
  { Icon: typeof CheckCircle2; color: string; bar: string; live: "polite" | "assertive" }
> = {
  success: { Icon: CheckCircle2, color: "text-success", bar: "bg-success", live: "polite" },
  error: { Icon: XCircle, color: "text-danger", bar: "bg-danger", live: "assertive" },
  info: { Icon: Info, color: "text-primary", bar: "bg-primary", live: "polite" },
  warning: { Icon: AlertTriangle, color: "text-warning", bar: "bg-warning", live: "polite" },
};

/**
 * Global toast viewport. Mounted once in the root layout. Subscribes to the
 * `toast` store and renders a stack of auto-dismissing cards — top-center on
 * narrow screens, bottom-right on desktop. Each card shows a shrinking progress
 * bar over its lifetime (paused on hover) and can carry an optional action.
 */
export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => subscribe(setToasts), []);

  // Fire any toast handed off across a server-action redirect (flash cookie).
  useEffect(() => {
    const flash = consumeFlashToast();
    if (flash) toast.show(flash);
  }, []);

  return (
    <div
      className={cn(
        "pointer-events-none fixed z-[1300] flex flex-col gap-2 p-3",
        // Narrow: pinned top-center. Desktop: bottom-right.
        "inset-x-0 top-0 items-center",
        "sm:inset-x-auto sm:top-auto sm:right-0 sm:bottom-0 sm:items-end",
      )}
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastCard({ toast: t }: { toast: Toast }) {
  const { Icon, color, bar, live } = TYPE_META[t.type];
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remaining = useRef(t.duration);
  const startedAt = useRef(0);

  // Auto-dismiss timer that can be paused/resumed on hover so users can read.
  useEffect(() => {
    if (paused) return;
    startedAt.current = Date.now();
    timer.current = setTimeout(() => dismiss(t.id), remaining.current);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      remaining.current -= Date.now() - startedAt.current;
    };
  }, [paused, t.id]);

  return (
    <motion.div
      layout
      role="status"
      aria-live={live}
      initial={{ opacity: 0, y: -12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
      transition={{ type: "tween", duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={cn(
        "pixel-box-sm pointer-events-auto relative w-[min(92vw,22rem)] overflow-hidden",
        "bg-panel text-ink flex items-start gap-2.5 px-3.5 py-3",
      )}
    >
      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", color)} aria-hidden />
      <p className="min-w-0 flex-1 text-sm leading-snug break-words">{t.message}</p>
      {t.action && (
        <button
          type="button"
          onClick={() => {
            t.action?.onClick();
            dismiss(t.id);
          }}
          className={cn(
            "shrink-0 cursor-pointer text-sm font-semibold underline-offset-2 hover:underline",
            color,
          )}
        >
          {t.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={() => dismiss(t.id)}
        aria-label="Dismiss"
        className="text-muted hover:text-ink shrink-0 cursor-pointer transition-colors"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>

      {/* Countdown: shrinks left-to-right over the toast's lifetime. */}
      <span
        aria-hidden
        className={cn("absolute inset-x-0 bottom-0 h-1 origin-left", bar)}
        style={{
          animation: `toast-shrink ${t.duration}ms linear forwards`,
          animationPlayState: paused ? "paused" : "running",
        }}
      />
    </motion.div>
  );
}
