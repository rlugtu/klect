"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { PixelButton } from "@/components/ui/PixelButton";
import { pollPhase } from "@/lib/poll-status";

export type PollVoteOption = {
  id: string;
  name: string;
  image: string | null;
  votes: { userId: string; icon: string | null; name: string }[];
};

/** Submit button that reflects the form's pending state and an extra guard. */
function VoteSubmit({ disabled, label }: { disabled: boolean; label: string }) {
  const { pending } = useFormStatus();
  return (
    <PixelButton type="submit" disabled={pending || disabled}>
      {pending ? "Submitting…" : label}
    </PixelButton>
  );
}

export function PollVote({
  submitAction,
  options,
  startAt,
  endAt,
  maxVotes,
  revotesAllowed,
  myOptionIds,
}: {
  submitAction: (formData: FormData) => void | Promise<void>;
  options: PollVoteOption[];
  startAt: string;
  endAt: string | null;
  maxVotes: number | null;
  revotesAllowed: boolean;
  myOptionIds: string[];
}) {
  const phase = pollPhase(startAt, endAt);
  const active = phase === "active";
  const alreadyVoted = myOptionIds.length > 0;
  const votingLocked = !active || (alreadyVoted && !revotesAllowed);

  const [mode, setMode] = useState<"vote" | "results">(
    votingLocked ? "results" : "vote",
  );
  // Selection seeds from the caller's saved votes. After a submit revalidates the
  // server data, the page re-keys this island so it remounts with fresh picks.
  const [picks, setPicks] = useState<Set<string>>(new Set(myOptionIds));

  const atCap = maxVotes != null && picks.size >= maxVotes;
  const changed =
    picks.size !== myOptionIds.length ||
    [...picks].some((id) => !myOptionIds.includes(id));

  const results = [...options].sort((a, b) => b.votes.length - a.votes.length);
  const maxCount = Math.max(1, ...options.map((o) => o.votes.length));

  function togglePick(id: string) {
    if (votingLocked) return;
    setPicks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        if (maxVotes != null && next.size >= maxVotes) return prev;
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Vote / Results toggle */}
      <div className="pixel-box-sm bg-panel flex overflow-hidden p-0">
        {(["vote", "results"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`font-pixel flex-1 py-2 text-sm uppercase ${
              mode === m ? "bg-primary text-primary-ink" : "text-muted"
            }`}
          >
            {m === "vote" ? "Vote" : "Results"}
          </button>
        ))}
      </div>

      {mode === "vote" ? (
        <form action={submitAction} className="flex flex-col gap-3">
          {[...picks].map((id) => (
            <input key={id} type="hidden" name="optionIds" value={id} />
          ))}

          <ul className="flex flex-col gap-2">
            {options.map((o) => {
              const on = picks.has(o.id);
              const disabled = votingLocked || (!on && atCap);
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => togglePick(o.id)}
                    disabled={disabled}
                    className={`pixel-box-sm flex w-full items-center gap-3 p-2 text-left ${
                      on ? "bg-primary/20 border-primary" : "bg-panel"
                    } ${!on && disabled ? "opacity-40" : ""}`}
                  >
                    <Thumb image={o.image} />
                    <span className="min-w-0 flex-1 text-sm">{o.name}</span>
                    {on && <span className="text-primary shrink-0">✓</span>}
                  </button>
                </li>
              );
            })}
          </ul>

          {votingLocked ? (
            <p className="text-muted text-center text-sm">
              {phase === "ended"
                ? "This poll has ended."
                : phase === "scheduled"
                  ? "Voting hasn’t opened yet."
                  : "You’ve voted."}
            </p>
          ) : (
            <>
              <p className="text-muted text-center text-sm">
                {maxVotes == null
                  ? "Unlimited votes"
                  : `${Math.max(0, maxVotes - picks.size)} vote${
                      maxVotes - picks.size === 1 ? "" : "s"
                    } remaining`}
              </p>
              <VoteSubmit
                disabled={!changed || picks.size === 0}
                label={alreadyVoted ? "Update vote" : "Submit vote"}
              />
            </>
          )}
        </form>
      ) : (
        <ul className="flex flex-col gap-2">
          {results.map((o) => (
            <li
              key={o.id}
              className="pixel-box-sm bg-panel flex flex-col gap-1.5 p-2"
            >
              <div className="flex items-center gap-3">
                <Thumb image={o.image} />
                <span className="min-w-0 flex-1 text-sm">{o.name}</span>
                <span className="font-pixel text-sm">{o.votes.length}</span>
              </div>
              <div className="bg-bg h-2 overflow-hidden">
                <div
                  className="bg-primary h-full"
                  style={{ width: `${(o.votes.length / maxCount) * 100}%` }}
                />
              </div>
              {o.votes.length > 0 && (
                <span className="text-sm" title={o.votes.map((v) => v.name).join(", ")}>
                  {o.votes.map((v) => v.icon ?? "🙂").join(" ")}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Thumb({ image }: { image: string | null }) {
  return image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={image}
      alt=""
      loading="lazy"
      className="pixel-box-sm bg-panel h-12 w-12 shrink-0 object-cover"
    />
  ) : (
    <span className="bg-bg grid h-12 w-12 shrink-0 place-items-center">🔖</span>
  );
}
