"use server";

import { requireUser } from "@/lib/session";
import { fetchLinkMetadata as fetchMetadata } from "@/lib/core/metadata";

export type { LinkMetadata, MetadataResult } from "@/lib/core/metadata";

export async function fetchLinkMetadata(rawUrl: string) {
  await requireUser();
  return fetchMetadata(rawUrl);
}
