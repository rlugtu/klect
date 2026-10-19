"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import {
  selectActiveBookmarks,
  selectActiveLists,
  type SelectionCommitResult,
} from "@/lib/actions/entitlements";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelCard } from "@/components/ui/PixelCard";

/**
 * The downgrade-selection picker: Stage 4's UI half on web.
 *
 * Shown to a lapsed account that is over a free cap. Nothing is deleted: the
 * user chooses what stays active and the rest is stamped `lockedAt` (preserved,
 * read-only, outside the cap count, and restored in full on re-subscribe).
 *
 * ## Why this is one step at a time rather than one big form
 *
 * `core.selectActiveBookmarks` only accepts bookmarks that live in the user's
 * *unlocked* lists, and rejects anything else rather than skipping it. So the
 * list commit has to land before the bookmark candidates are even knowable. The
 * server page therefore renders exactly one step, the commit reports which step
 * is next, and the screen re-reads from the server between them. A single form
 * holding both would be picking bookmarks out of lists it is about to lock.
 *
 * All validation here is courtesy. The caps and the ownership check are enforced
 * in `core/active-selection.ts` on every commit, so a tampered client gets a
 * refusal, not a bigger free tier.
 *
 * ## Two modes, one picker
 *
 * The same picker serves both states the core status distinguishes (see the "two
 * modes" note in `core/active-selection.ts`). `mode="downgrade"` is the forced,
 * over-cap case the screen was built for. `mode="reclaim"` is the under-cap case: a
 * free user who trimmed their own content back down now has empty slots and locked
 * data, and this is how they put one back in the other. Only the copy and the
 * presence of an exit link differ; the mechanics are identical, because "which rows
 * are active" is the same question and the same commit either way.
 */

/** One selectable row, flattened by the page so this component stays generic. */
export type SelectionOption = {
  id: string;
  /** Leading emoji (a list's icon, or a fixed glyph for a bookmark). */
  icon: string;
  /** Row title. */
  label: string;
  /** Supporting line: bookmark counts for a list, the parent list for a bookmark. */
  meta: string;
  /** Already locked. Still selectable, and picking it unlocks it again. */
  locked: boolean;
};

type Kind = "lists" | "bookmarks";

/**
 * "downgrade" = over a cap, something has to be locked, the screen is a gate.
 * "reclaim" = under the caps with locks still held, nothing is owed, the screen is
 * an offer the user can walk away from.
 */
export type SelectionMode = "downgrade" | "reclaim";

const COPY: Record<SelectionMode, Record<Kind, { noun: string; cta: string; heading: string }>> = {
  downgrade: {
    lists: {
      noun: "lists",
      cta: "Keep these lists",
      heading: "Choose the lists to keep",
    },
    bookmarks: {
      noun: "bookmarks",
      cta: "Keep these bookmarks",
      heading: "Choose the bookmarks to keep",
    },
  },
  reclaim: {
    lists: {
      noun: "lists",
      cta: "Update active lists",
      heading: "Bring back a locked list",
    },
    bookmarks: {
      noun: "bookmarks",
      cta: "Update active bookmarks",
      heading: "Bring back a locked bookmark",
    },
  },
};

const COMMIT: Record<Kind, (ids: string[]) => Promise<SelectionCommitResult>> = {
  lists: selectActiveLists,
  bookmarks: selectActiveBookmarks,
};

export function DowngradeSelection({
  kind,
  options,
  limit,
  current,
  mode = "downgrade",
}: {
  kind: Kind;
  /** Everything the user could keep, in the order they should be offered. */
  options: SelectionOption[];
  /** The free-tier cap, echoed from the server, never hardcoded here. */
  limit: number;
  /** How many they hold right now, so the copy states the real gap. */
  current: number;
  /** Which of the two states this render is for. See {@link SelectionMode}. */
  mode?: SelectionMode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { noun, cta, heading } = COPY[mode][kind];

  // In downgrade mode there are always more options than the limit, so this is the
  // limit. In reclaim mode the user is under the cap, so the whole set can be
  // smaller than it, and then "pick all of them" is the right answer. `min` covers
  // both, plus the odd race where the count changed in another tab mid-render.
  const target = Math.min(limit, options.length);

  // Pre-select the first `target` rows so one click is a valid answer. They are
  // ordered newest-first for bookmarks and in list order for lists, which is the
  // likeliest intent, and every one of them can be toggled off.
  const [selected, setSelected] = useState<string[]>(() =>
    options.slice(0, target).map((o) => o.id),
  );

  const full = selected.length >= target;
  const ready = selected.length === target && !pending;

  function toggle(id: string) {
    setSelected((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : full ? cur : [...cur, id],
    );
  }

  function submit() {
    startTransition(async () => {
      const result = await COMMIT[kind](selected);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      toast.success(
        result.lockedCount === 0
          ? `Keeping ${result.activeCount} ${noun}.`
          : `Keeping ${result.activeCount} ${noun}. ${result.lockedCount} locked and saved.`,
      );

      // The server just told us whether anything is still owed. "done" means the
      // account is coherent again and /downgrade would only bounce them home, so
      // go straight there; otherwise re-read and render the next step.
      if (result.nextStep === "done") router.replace("/");
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <h1 className="text-primary text-2xl">{heading}</h1>
        {mode === "downgrade" ? (
          <p className="text-muted">
            Your Klect Pro subscription has ended. Free accounts keep{" "}
            <strong>{limit}</strong> {noun} and you have <strong>{current}</strong>.
            Pick the {target} you want to stay active.
          </p>
        ) : (
          <p className="text-muted">
            You made room. Free accounts keep <strong>{limit}</strong> {noun} active
            and you have <strong>{current}</strong>, so you can bring locked {noun}{" "}
            back. Pick the {target} you want active.
          </p>
        )}
        <p className="text-muted text-sm">
          Nothing is deleted. Everything you don&apos;t pick is locked and kept
          exactly as it is (read it, export it, delete it), and unlocks the
          moment you subscribe again.
        </p>
      </header>

      <div className="border-border bg-panel sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-2 px-4 py-3">
        <span className="font-pixel text-sm" aria-live="polite">
          {selected.length} of {target} selected
        </span>
        <div className="flex items-center gap-2">
          {selected.length > 0 && (
            <PixelButton
              variant="ghost"
              size="sm"
              onClick={() => setSelected([])}
              disabled={pending}
            >
              Clear
            </PixelButton>
          )}
          <PixelButton size="sm" onClick={submit} disabled={!ready}>
            {pending ? "Saving…" : cta}
          </PixelButton>
        </div>
      </div>

      {/* Reclaim is an offer, not a gate, so it needs a way out. Downgrade mode
          deliberately has none: the account is over a cap until a choice lands. */}
      {mode === "reclaim" && (
        <Link href="/" className="text-muted w-fit text-sm underline">
          Leave things as they are
        </Link>
      )}

      <ul className="flex flex-col gap-2">
        {options.map((option) => {
          const on = selected.includes(option.id);
          const blocked = !on && full;
          return (
            <li key={option.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                disabled={blocked || pending}
                onClick={() => toggle(option.id)}
                className={cn(
                  "border-border bg-panel flex w-full cursor-pointer items-center gap-3 border-2 px-3 py-2.5 text-left",
                  "hover:border-primary disabled:cursor-not-allowed disabled:opacity-40",
                  on && "border-primary bg-primary/15",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "border-border flex size-5 shrink-0 items-center justify-center border-2",
                    on && "bg-primary text-primary-ink border-primary",
                  )}
                >
                  {on && <Check size={12} />}
                </span>
                <span className="shrink-0 text-xl" aria-hidden>
                  {option.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate">{option.label}</span>
                    {option.locked && (
                      <Lock size={12} className="text-muted shrink-0" aria-label="Locked" />
                    )}
                  </span>
                  <span className="text-muted block truncate text-sm">{option.meta}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <PixelCard className="flex flex-col gap-3">
        <h2 className="text-sm">Want to keep everything?</h2>
        <p className="text-muted text-sm">
          Klect Pro removes both caps, and subscribing unlocks every list and
          bookmark you already have, with no selection needed.
        </p>
        <Link href={`/upgrade?reason=${kind}`} className="w-fit">
          <PixelButton size="sm">Upgrade to Pro</PixelButton>
        </Link>
      </PixelCard>
    </div>
  );
}
