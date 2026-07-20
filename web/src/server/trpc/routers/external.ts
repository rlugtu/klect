import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import * as places from "@/lib/core/places";
import {
  fetchLinkMetadata,
  getLinkExtraction,
  getLinkComprehension,
} from "@/lib/core/metadata";
import { comprehendCaption } from "@/lib/core/comprehend";

/**
 * External-service lookups (Mapbox, Microlink, Anthropic). Exposed so mobile gets
 * location autocomplete, link autofill, and caption extraction through the server
 * without shipping any API keys. Queries — no DB writes, but they do hit paid APIs.
 */

export const placesRouter = router({
  search: protectedProcedure
    .input(z.object({ text: z.string(), sessionToken: z.string() }))
    .query(({ input }) => places.searchPlaces(input.text, input.sessionToken)),

  retrieve: protectedProcedure
    .input(z.object({ id: z.string(), sessionToken: z.string() }))
    .query(({ input }) => places.retrievePlace(input.id, input.sessionToken)),

  reverseGeocode: protectedProcedure
    .input(z.object({ lat: z.number(), lon: z.number() }))
    .query(({ input }) => places.reverseGeocode(input.lat, input.lon)),
});

export const metadataRouter = router({
  // Phase 1 — fast extraction (no LLM). Clients call this first.
  extract: protectedProcedure
    .input(z.object({ url: z.string() }))
    .query(({ input }) => getLinkExtraction(input.url)),

  // Phase 2 — comprehension (JSON-LD / LLM) + geocode. Clients call this after
  // extract to patch tags/location/coords/details into the form.
  comprehend: protectedProcedure
    .input(z.object({ url: z.string() }))
    .query(({ input }) => getLinkComprehension(input.url)),

  // One-shot (extraction + comprehension merged). Kept for callers that want a
  // single round trip.
  fetch: protectedProcedure
    .input(z.object({ url: z.string() }))
    .query(({ input }) => fetchLinkMetadata(input.url)),
});

export const comprehendRouter = router({
  caption: protectedProcedure
    .input(
      z.object({
        caption: z.string(),
        author: z.string().nullish(),
        sourceUrl: z.string().nullish(),
      }),
    )
    .query(({ input }) =>
      comprehendCaption(input.caption, {
        author: input.author,
        sourceUrl: input.sourceUrl,
      }),
    ),
});
