"use server";

import { requireUser } from "@/lib/session";
import { comprehendCaption as comprehend } from "@/lib/core/comprehend";

export type { Comprehension } from "@/lib/core/comprehend";

export async function comprehendCaption(
  caption: string,
  hints?: { author?: string | null; sourceUrl?: string | null },
) {
  await requireUser();
  return comprehend(caption, hints);
}
