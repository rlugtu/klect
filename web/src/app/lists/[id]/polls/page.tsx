import { redirect } from "next/navigation";

/**
 * Polls are now a face of the single-list view (`/lists/[id]?tab=polls`), not a
 * standalone route — so the header, list details, and tab bar stay mounted.
 * This legacy URL just forwards to the inline tab.
 */
export default async function PollsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/lists/${id}?tab=polls`);
}
