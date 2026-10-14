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

/**
 * The autofill path the UI uses: extraction + comprehension, run concurrently
 * server-side (comprehension bounded by a timeout) and merged into one result.
 */
export async function fetchLinkMetadata(rawUrl: string) {
  await requireUser();
  return fetchMetadata(rawUrl);
}

/** Extraction only — the fast, no-LLM half of the unfurl, exposed on its own. */
export async function fetchLinkExtraction(rawUrl: string) {
  await requireUser();
  return getLinkExtraction(rawUrl);
}

/** Comprehension only — tags/location/coords/details, exposed on its own. */
export async function fetchLinkComprehension(rawUrl: string) {
  await requireUser();
  return getLinkComprehension(rawUrl);
}
