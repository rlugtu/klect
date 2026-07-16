"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import * as core from "@/lib/core/polls";

/** Parse a `datetime-local` value into a Date, or a fallback when blank. */
function toDate(v: FormDataEntryValue | null, fallback: Date | null): Date | null {
  const s = v === null ? "" : String(v).trim();
  if (s === "") return fallback;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

/** Extract a poll's fields + selected option bookmark ids from FormData. */
function pollInputFromFormData(formData: FormData): core.PollInput {
  const rawMax = String(formData.get("maxVotes") ?? "").trim();
  const maxVotes = rawMax === "" ? null : parseInt(rawMax, 10);

  return {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    startAt: toDate(formData.get("startAt"), new Date())!,
    endAt: toDate(formData.get("endAt"), null),
    maxVotes: maxVotes != null && Number.isFinite(maxVotes) ? maxVotes : null,
    revotesAllowed: formData.get("revotesAllowed") === "on",
    isAnonymous: formData.get("anonymous") === "on",
    bookmarkIds: formData.getAll("bookmarkIds").map((b) => String(b)),
  };
}

export async function createPoll(listId: string, formData: FormData) {
  const user = await requireUser();
  const poll = await core.createPoll(
    user.id,
    listId,
    pollInputFromFormData(formData),
  );

  revalidatePath(`/lists/${listId}`);
  redirect(`/lists/${listId}/polls/${poll.id}`);
}

export async function updatePoll(pollId: string, formData: FormData) {
  const user = await requireUser();
  const { listId } = await core.updatePoll(
    user.id,
    pollId,
    pollInputFromFormData(formData),
  );

  revalidatePath(`/lists/${listId}`);
  revalidatePath(`/lists/${listId}/polls/${pollId}`);
  redirect(`/lists/${listId}/polls/${pollId}`);
}

export async function deletePoll(pollId: string) {
  const user = await requireUser();
  const { listId } = await core.deletePoll(user.id, pollId);

  revalidatePath(`/lists/${listId}`);
  redirect(`/lists/${listId}?tab=polls`);
}

/** Replace the caller's votes with the checked options; stays on the poll. */
export async function submitVotes(pollId: string, formData: FormData) {
  const user = await requireUser();
  const optionIds = formData.getAll("optionIds").map((o) => String(o));
  const { listId } = await core.submitVotes(user.id, pollId, optionIds);

  revalidatePath(`/lists/${listId}/polls/${pollId}`);
}
