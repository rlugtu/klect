import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge class names, resolving Tailwind conflicts (last wins). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Compact relative time, e.g. "just now", "5m ago", "3d ago", or a date. */
export function timeAgo(date: Date | string): string {
  const then = new Date(date).getTime();
  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}

/**
 * Client-side give-up, NOT a true cancel: `p` keeps running on the server even after
 * this resolves to `fallback` — the server-action/fetch call this wraps has no cancellation
 * signal, so the underlying work finishes and still populates whatever cache it would have
 * anyway. A retry after a timeout is therefore usually fast. Never "fix" this into a real
 * abort without changing the call to a transport that supports one (e.g. a tRPC `.query`
 * with a `signal`).
 */
export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}
