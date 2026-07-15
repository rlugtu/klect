import { z } from "zod";
import { coerceTheme } from "@/lib/theme";

/**
 * Zod input schemas for the tRPC surface — the typed contract mobile sends over
 * HTTP. They mirror the `core(input)` shapes; core still does business
 * normalization, so these validate structure, not business rules.
 */

export const listInput = z.object({
  name: z.string(),
  description: z.string().optional(),
  icon: z.string().optional(),
  isPublic: z.boolean().optional(),
});

export const bookmarkInput = z.object({
  name: z.string(),
  description: z.string(),
  urls: z.array(z.string()),
  images: z.array(z.string()),
  notes: z.string(),
  location: z.string(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  rating: z.number(),
  visited: z.boolean(),
  videoUrl: z.string(),
  videoType: z.string(),
  tagNames: z.array(z.string()),
});

export const pollInput = z.object({
  name: z.string(),
  description: z.string(),
  startAt: z.coerce.date(),
  endAt: z.coerce.date().nullable(),
  maxVotes: z.number().int().nullable(),
  revotesAllowed: z.boolean(),
  isAnonymous: z.boolean().optional(),
  bookmarkIds: z.array(z.string()),
});

export const profileInput = z.object({
  handle: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  birthday: z.coerce.date().nullable(),
  icon: z.string().nullable(),
  theme: z.string().transform(coerceTheme),
});

export const inviteRole = z.enum(["VIEWER", "COLLABORATOR"]);
