/**
 * Poll timing helpers shared by server pages and client islands (no `server-only`).
 * Dates may arrive as `Date` (RSC) or ISO string (serialized to a client island).
 */
export type PollPhase = "scheduled" | "active" | "ended";

export function pollPhase(
  startAt: Date | string,
  endAt: Date | string | null,
  now: number = Date.now(),
): PollPhase {
  const start = new Date(startAt).getTime();
  const end = endAt ? new Date(endAt).getTime() : null;
  if (now < start) return "scheduled";
  if (end != null && now >= end) return "ended";
  return "active";
}

/** Short relative status label, e.g. "Scheduled", "Ends in 3h", "Active", "Ended". */
export function pollStatusLabel(
  startAt: Date | string,
  endAt: Date | string | null,
  now: number = Date.now(),
): string {
  const phase = pollPhase(startAt, endAt, now);
  if (phase === "scheduled") return "Scheduled";
  if (phase === "ended") return "Ended";
  const end = endAt ? new Date(endAt).getTime() : null;
  if (end == null) return "Active";
  const mins = Math.round((end - now) / 60000);
  if (mins < 60) return `Ends in ${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `Ends in ${hrs}h`;
  return `Ends in ${Math.round(hrs / 24)}d`;
}
