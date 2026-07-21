import "server-only";
import { prisma } from "@/lib/db";

/** Coarse feedback buckets the client can send. */
export const FEEDBACK_CATEGORIES = ["bug", "idea", "other"] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

const MAX_MESSAGE_LENGTH = 2000;

export type FeedbackInput = {
  category: string;
  message: string;
  platform?: string | null;
  appVersion?: string | null;
};

/**
 * Store a signed-in user's app feedback. Validates the message (non-empty,
 * length-capped) and normalizes the category to the allow-list (unknown →
 * "other"). Reviewed later via Prisma Studio.
 */
export async function submitFeedback(userId: string, input: FeedbackInput) {
  const message = (input.message ?? "").trim();
  if (!message) throw new Error("Feedback can't be empty.");
  if (message.length > MAX_MESSAGE_LENGTH)
    throw new Error("Feedback is too long.");

  const category = (FEEDBACK_CATEGORIES as readonly string[]).includes(
    input.category,
  )
    ? input.category
    : "other";

  const platform = input.platform?.trim() || null;
  const appVersion = input.appVersion?.trim() || null;

  await prisma.feedback.create({
    data: { userId, category, message, platform, appVersion },
  });
}
