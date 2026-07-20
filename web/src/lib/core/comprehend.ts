import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

/**
 * Extract structured bookmark fields from a social-media caption via Claude.
 * Auth-gated by the caller. Best-effort: returns `null` on missing key / refusal
 * / parse failure so the caller can fall back to the raw caption.
 */

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
  "- tags: up to 3 short lowercase topical tags (no '#') — only clearly relevant",
  "  ones; fewer is fine and an empty array if unclear. Don't pad to reach 3.",
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

// Local structured shape for link-metadata comprehension (distinct from the
// caption `schema` above). Fields are required but may be empty ("" / []) when
// the source doesn't support them — we normalize on our side. `details` holds
// extracted vital info (steps/ingredients/etc.), one section per kind.
const metadataSchema = z.object({
  name: z.string(),
  location: z.string(),
  summary: z.string(),
  tags: z.array(z.string()),
  details: z.array(
    z.object({
      heading: z.string(),
      items: z.array(z.string()),
    }),
  ),
});

const METADATA_SYSTEM = [
  "You turn a web page (its metadata plus, when available, its extracted text) into",
  "clean, readable bookmark fields. Return:",
  "- name: a short, specific title for the page. Strip site-name suffixes and SEO",
  "  cruft (e.g. ' | Site Name', ' - Home', trailing brand/tagline). Keep the",
  "  meaningful part.",
  "- summary: a 1–2 sentence plain summary of what the page/link is about. Clean up",
  "  marketing boilerplate and truncation artifacts. If the metadata is thin, write",
  "  a brief neutral summary from the title, URL, and page content.",
  "- location: a single place string if the page clearly is about one (a venue,",
  "  restaurant, city, address, neighborhood); otherwise an empty string.",
  "- tags: up to 3 short lowercase topical tags (no '#') — only clearly relevant",
  "  ones; fewer is fine and an empty array if unclear. Don't pad to reach 3.",
  "- details: extracted VITAL structured information — ONLY what the page content",
  "  actually contains. Each entry is { heading, items } where heading names the",
  "  kind of info and items is a list of short lines. Use it for:",
  "    • instructions / directions / steps (ordered how-to actions)",
  "    • lists / items / ingredients",
  "    • recipe & how-to extras: tools or materials needed, prep/cook time,",
  "      difficulty, servings or yield, prerequisites",
  "    • event details: date/time, venue, address, RSVP/ticket info, price",
  "    • product & pricing: key specs, price, sizes/options, key features,",
  "      warnings or cautions",
  "    • place/business info: hours, phone, address, menu highlights, reservations",
  "  Give each kind its own section with a clear heading (e.g. 'Ingredients',",
  "  'Steps', 'Hours', 'Event Details'). Preserve the source's order for steps.",
  "  Return an empty details array when the page has no such structured info (e.g.",
  "  a plain article or blog post).",
  "Leave any field empty when the source doesn't support it. Do NOT invent facts —",
  "only include information present in the provided title, description, URL, or",
  "page content.",
].join("\n");

/**
 * Refine raw link metadata into clean bookmark fields via Claude. Auth-gated by
 * the caller. Best-effort: returns `null` on missing key / refusal / parse failure
 * so the caller can fall back to the raw extracted metadata.
 */
export async function comprehendMetadata(raw: {
  title?: string | null;
  description?: string | null;
  url: string;
  publisher?: string | null;
  author?: string | null;
  pageText?: string | null;
}): Promise<Comprehension | null> {
  const hasText =
    (raw.title ?? "").trim() ||
    (raw.description ?? "").trim() ||
    (raw.pageText ?? "").trim();
  if (!hasText) return null;

  const client = anthropic();
  if (!client) return null;

  const context = [
    `URL: ${raw.url}`,
    raw.publisher ? `Publisher: ${raw.publisher}` : null,
    raw.author ? `Author: ${raw.author}` : null,
    raw.title ? `Title: ${raw.title}` : null,
    raw.description ? `Description:\n${raw.description}` : null,
    raw.pageText ? `Page content:\n${raw.pageText}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await client.messages.parse({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: METADATA_SYSTEM,
      messages: [{ role: "user", content: context }],
      output_config: { format: zodOutputFormat(metadataSchema) },
    });

    if (res.stop_reason === "refusal" || !res.parsed_output) {
      console.warn(`[comprehend] no structured output (stop_reason: ${res.stop_reason}).`);
      return null;
    }

    const out = res.parsed_output;
    const description = assembleDescription(out.summary, out.details);
    console.log("[comprehend] metadata refined:", {
      name: out.name,
      location: out.location,
      tags: out.tags,
      detailSections: out.details.map((d) => d.heading).filter(Boolean),
    });
    return {
      title: out.name.trim(),
      location: out.location.trim(),
      description,
      tags: out.tags.map((t) => t.trim().toLowerCase()).filter(Boolean),
    };
  } catch (err) {
    console.warn("[comprehend] metadata request failed:", (err as Error).message);
    return null;
  }
}

/**
 * Build the bookmark description: a "Link Summary:" header + the summary, then a
 * labeled bullet section per non-empty detail group (Ingredients, Steps, Hours…).
 */
export function assembleDescription(
  summary: string,
  details: { heading: string; items: string[] }[],
): string {
  const parts: string[] = [];
  const s = summary.trim();
  if (s) parts.push(`Link Summary:\n${s}`);
  for (const section of details) {
    const heading = section.heading.trim();
    const items = section.items.map((i) => i.trim()).filter(Boolean);
    if (!heading || !items.length) continue;
    parts.push(`${heading}:\n${items.map((i) => `- ${i}`).join("\n")}`);
  }
  // Empty when the model produced neither a summary nor any detail sections — the
  // caller's `if (refined.description)` guard then keeps the raw metadata.
  return parts.join("\n\n");
}

export async function comprehendCaption(
  caption: string,
  hints?: { author?: string | null; sourceUrl?: string | null },
): Promise<Comprehension | null> {
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
