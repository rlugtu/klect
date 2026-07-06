"use server";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { requireUser } from "@/lib/session";

export type Comprehension = {
  title: string;
  location: string;
  description: string;
  tags: string[];
};

// Structured shape Claude must return. Fields are required but may be empty
// ("" / []) when the caption doesn't contain that information — structured
// outputs can't express optionality, so we normalize empties on our side.
const schema = z.object({
  title: z.string(),
  location: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
});

const SYSTEM = [
  "You extract structured bookmark fields from a social-media caption",
  "(Instagram, TikTok, or Facebook). Return:",
  "- title: a short, specific name for what the post is about (e.g. the venue,",
  "  dish, place, or product). Not the whole caption.",
  "- location: a single place string if the caption clearly names one",
  "  (venue, city, address, neighborhood); otherwise an empty string.",
  "- description: a 1–2 sentence plain summary. Strip hashtags, @mentions,",
  "  emoji spam, and 'link in bio' boilerplate.",
  "- tags: 2–5 short lowercase topical tags (no '#'); empty array if unclear.",
  "Leave any field empty when the caption doesn't support it. Do not invent",
  "facts that aren't in the caption.",
].join("\n");

function anthropic(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[comprehend] ANTHROPIC_API_KEY not set — caption comprehension disabled.");
    return null;
  }
  return new Anthropic();
}

/**
 * Turn a raw social-media caption into structured bookmark fields via Claude.
 * Best-effort: returns `null` on missing key / refusal / parse failure so the
 * caller can fall back to using the raw caption directly.
 */
export async function comprehendCaption(
  caption: string,
  hints?: { author?: string | null; sourceUrl?: string | null },
): Promise<Comprehension | null> {
  await requireUser();

  const text = caption.trim();
  if (!text) return null;

  const client = anthropic();
  if (!client) return null;

  const context = [
    hints?.author ? `Author: ${hints.author}` : null,
    hints?.sourceUrl ? `Source: ${hints.sourceUrl}` : null,
    `Caption:\n${text}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await client.messages.parse({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: SYSTEM,
      messages: [{ role: "user", content: context }],
      output_config: { format: zodOutputFormat(schema) },
    });

    if (res.stop_reason === "refusal" || !res.parsed_output) {
      console.warn(`[comprehend] no structured output (stop_reason: ${res.stop_reason}).`);
      return null;
    }

    const out = res.parsed_output;
    console.log("[comprehend] extracted:", {
      title: out.title,
      location: out.location,
      tags: out.tags,
    });
    return {
      title: out.title.trim(),
      location: out.location.trim(),
      description: out.description.trim(),
      tags: out.tags.map((t) => t.trim().toLowerCase()).filter(Boolean),
    };
  } catch (err) {
    console.warn("[comprehend] request failed:", (err as Error).message);
    return null;
  }
}
