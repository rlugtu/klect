"use server";

import { requireUser } from "@/lib/session";
import {
  fetchLinkMetadata as fetchMetadata,
  getLinkExtraction,
  getLinkComprehension,
} from "@/lib/core/metadata";

export type {
  LinkMetadata,
  MetadataResult,
  LinkComprehension,
} from "@/lib/core/metadata";

/** One-shot unfurl (extraction + comprehension). */
export async function fetchLinkMetadata(rawUrl: string) {
  await requireUser();
  return fetchMetadata(rawUrl);
}

/** Phase 1: fast extraction — fill name/description/images/video immediately. */
export async function fetchLinkExtraction(rawUrl: string) {
  await requireUser();
  return getLinkExtraction(rawUrl);
}

/** Phase 2: comprehension — patch tags/location/coords/details in the background. */
export async function fetchLinkComprehension(rawUrl: string) {
  await requireUser();
  return getLinkComprehension(rawUrl);
}
