"use server";

import { requireUser } from "@/lib/session";
import {
  findNearbyBookmarks as findNearby,
  type NearbyQuery,
  type NearbyResult,
} from "@/lib/core/nearby";

export type { NearbyBookmark, NearbyResult } from "@/lib/core/nearby";

export async function findNearbyBookmarks(input: NearbyQuery): Promise<NearbyResult> {
  const user = await requireUser();
  return findNearby(user.id, input);
}
