/**
 * Toast notifications — the store + imperative API (mobile).
 *
 * A tiny pub/sub singleton so `toast.success(...)` can be called imperatively
 * from inside the app's `try { await trpc.x.mutate() } catch {}` blocks — there's
 * no React Query layer to hang onSuccess/onError off, so this matches the existing
 * imperative style. Mirrors the web app's `toast` API (web/src/lib/toast.ts) so the
 * two clients share one mental model. The `<ToastHost />` overlay subscribes and
 * renders (components/toast/ToastHost.tsx).
 *
 * Showing a toast also fires a haptic + a screen-reader announcement.
 */
import { AccessibilityInfo } from 'react-native';
import * as Haptics from 'expo-haptics';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export type ToastAction = {
  label: string;
  onPress: () => void;
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

/** Default auto-close window (matches web). */
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

function haptic(type: ToastType) {
  const fb =
    type === 'success'
      ? Haptics.NotificationFeedbackType.Success
      : type === 'error'
        ? Haptics.NotificationFeedbackType.Error
        : Haptics.NotificationFeedbackType.Warning;
  if (type === 'info') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  } else {
    Haptics.notificationAsync(fb).catch(() => {});
  }
}

function add(input: ToastInput): string {
  const message = input.message?.trim();
  if (!message) return '';
  const type = input.type ?? 'info';

  // Dedup: an identical message already showing just refreshes it.
  const existing = toasts.find((t) => t.message === message && t.type === type);
  if (existing) {
    toasts = toasts.map((t) => (t.id === existing.id ? { ...t } : t));
    emit();
    return existing.id;
  }

  const toast: Toast = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    message,
    duration: input.duration ?? DEFAULT_DURATION,
    action: input.action,
  };

  // Newest first; cap the visible count.
  toasts = [toast, ...toasts].slice(0, MAX_TOASTS);
  emit();

  haptic(type);
  AccessibilityInfo.announceForAccessibility(message);
  return toast.id;
}

export function dismiss(id?: string) {
  toasts = id ? toasts.filter((t) => t.id !== id) : [];
  emit();
}

export const toast = {
  show: (input: ToastInput) => add(input),
  success: (message: string, opts?: Omit<ToastInput, 'message' | 'type'>) =>
    add({ ...opts, type: 'success', message }),
  error: (message: string, opts?: Omit<ToastInput, 'message' | 'type'>) =>
    add({ ...opts, type: 'error', message }),
  info: (message: string, opts?: Omit<ToastInput, 'message' | 'type'>) =>
    add({ ...opts, type: 'info', message }),
  warning: (message: string, opts?: Omit<ToastInput, 'message' | 'type'>) =>
    add({ ...opts, type: 'warning', message }),
  dismiss,
};

/** Pull a message off an unknown thrown value for `toast.error(...)`. */
export function errorMessage(e: unknown, fallback = 'Something went wrong'): string {
  return e instanceof Error && e.message ? e.message : fallback;
}
