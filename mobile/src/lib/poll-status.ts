/**
 * Relative status label derived from a poll's start/end. Dates arrive as ISO
 * strings over the wire (the tRPC client has no date transformer), so callers
 * pass the raw `startAt` / `endAt` strings.
 */
export function pollStatus(startAt: string, endAt: string | null): string {
  const now = Date.now();
  const start = new Date(startAt).getTime();
  const end = endAt ? new Date(endAt).getTime() : null;
  if (now < start) return 'Scheduled';
  if (end != null && now >= end) return 'Ended';
  if (end == null) return 'Active';
  const mins = Math.round((end - now) / 60000);
  if (mins < 60) return `Ends in ${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `Ends in ${hrs}h`;
  return `Ends in ${Math.round(hrs / 24)}d`;
}
