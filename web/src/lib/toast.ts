/**
 * Toast notifications — the store + imperative API.
 *
 * A tiny framework-agnostic pub/sub singleton so `toast.success(...)` can be
 * called from ANY client component (or plain async code) — mirroring the mobile
 * app's imperative API so the two clients share one mental model. The `<Toaster />`
 * host (`components/ui/Toaster.tsx`) subscribes and renders.
 *
 * Toasts auto-dismiss after `DEFAULT_DURATION`; the host draws a shrinking
 * progress bar over that window and pauses it on hover.
 */

export type ToastType = "success" | "error" | "info" | "warning";

export type ToastAction = {
  label: string;
  onClick: () => void;
};

export type Toast = {
  id: string;
  type: ToastType;
  message: string;
  /** Auto-dismiss window in ms. */
  duration: number;
  action?: ToastAction;
};

export type ToastInput = {
  type?: ToastType;
  message: string;
  duration?: number;
  action?: ToastAction;
};

/** Default auto-close window (matches the mobile app). */
export const DEFAULT_DURATION = 3000;

/** Max toasts kept on screen at once — older ones drop off the far end. */
const MAX_TOASTS = 3;

type Listener = (toasts: Toast[]) => void;

let toasts: Toast[] = [];
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener(toasts);
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  listener(toasts);
  return () => {
    listeners.delete(listener);
  };
}

function add(input: ToastInput): string {
  const message = input.message?.trim();
  if (!message) return "";

  // Dedup: an identical message already showing just resets — avoids stacks of
  // the same line when an action is fired repeatedly.
  const existing = toasts.find(
    (t) => t.message === message && t.type === (input.type ?? "info"),
  );
  if (existing) {
    toasts = toasts.map((t) => (t.id === existing.id ? { ...t } : t));
    emit();
    return existing.id;
  }

  const toast: Toast = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: input.type ?? "info",
    message,
    duration: input.duration ?? DEFAULT_DURATION,
    action: input.action,
  };

  // Newest first; cap the visible count.
  toasts = [toast, ...toasts].slice(0, MAX_TOASTS);
  emit();
  return toast.id;
}

export function dismiss(id?: string) {
  toasts = id ? toasts.filter((t) => t.id !== id) : [];
  emit();
}

export const toast = {
  show: (input: ToastInput) => add(input),
  success: (message: string, opts?: Omit<ToastInput, "message" | "type">) =>
    add({ ...opts, type: "success", message }),
  error: (message: string, opts?: Omit<ToastInput, "message" | "type">) =>
    add({ ...opts, type: "error", message }),
  info: (message: string, opts?: Omit<ToastInput, "message" | "type">) =>
    add({ ...opts, type: "info", message }),
  warning: (message: string, opts?: Omit<ToastInput, "message" | "type">) =>
    add({ ...opts, type: "warning", message }),
  dismiss,
};

/** Pull the message off an unknown thrown value for `toast.error(...)`. */
export function errorMessage(e: unknown, fallback = "Something went wrong"): string {
  return e instanceof Error && e.message ? e.message : fallback;
}
