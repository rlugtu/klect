import "server-only";

/**
 * Map schema.org JSON-LD (parsed from a page's `application/ld+json` blocks) into
 * clean bookmark fields + labeled detail sections, matching the `{ heading, items }`
 * contract that `comprehend.ts` (assembleDescription) already renders.
 *
 * This is the fast, deterministic path: recipes, events, products, and places all
 * publish exact structured data, so we can extract Ingredients / Steps / Hours /
 * Event Details without an LLM call. Returns `null` when no usable type is present,
 * so the caller falls back to LLM comprehension.
 */

export type StructuredData = {
  name: string | null;
  description: string | null;
  location: string | null;
  images: string[];
  details: { heading: string; items: string[] }[];
};

type JsonObj = Record<string, unknown>;

function isObj(v: unknown): v is JsonObj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asArray(v: unknown): unknown[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function str(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  return null;
}

function typesOf(node: JsonObj): string[] {
  return asArray(node["@type"])
    .map((t) => (typeof t === "string" ? t.toLowerCase() : ""))
    .filter(Boolean);
}

/** Flatten top-level nodes, arrays, and `@graph` containers into typed nodes. */
function flatten(jsonLd: unknown[]): JsonObj[] {
  const out: JsonObj[] = [];
  const visit = (v: unknown) => {
    for (const item of asArray(v)) {
      if (!isObj(item)) continue;
      if (item["@graph"]) visit(item["@graph"]);
      if (item["@type"]) out.push(item);
    }
  };
  visit(jsonLd);
  return out;
}

/** ISO-8601 duration ("PT1H30M") → "1h 30m". */
function humanDuration(iso: unknown): string | null {
  const s = str(iso);
  if (!s) return null;
  const m = s.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/);
  if (!m) return null;
  const [, d, h, min] = m;
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (min) parts.push(`${min}m`);
  return parts.length ? parts.join(" ") : null;
}

/** A schema.org PostalAddress (or plain string) → single-line address. */
function addressToString(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (!isObj(v)) return null;
  const parts = [
    str(v.streetAddress),
    str(v.addressLocality),
    str(v.addressRegion),
    str(v.postalCode),
    str(v.addressCountry) ?? (isObj(v.addressCountry) ? str(v.addressCountry.name) : null),
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/** First usable image URL(s) off an image field (string | ImageObject | array). */
function imagesFrom(v: unknown): string[] {
  const out: string[] = [];
  for (const item of asArray(v)) {
    const url = typeof item === "string" ? item : isObj(item) ? str(item.url) : null;
    if (url && /^https?:\/\//i.test(url)) out.push(url);
  }
  return out;
}

/** recipeInstructions / HowTo steps → ordered list of short lines. */
function stepsFrom(v: unknown): string[] {
  const items: string[] = [];
  for (const step of asArray(v)) {
    if (typeof step === "string") {
      const s = step.trim();
      if (s) items.push(s);
      continue;
    }
    if (!isObj(step)) continue;
    const types = typesOf(step);
    // HowToSection wraps its own itemListElement of steps.
    if (types.includes("howtosection") && step.itemListElement) {
      items.push(...stepsFrom(step.itemListElement));
      continue;
    }
    const text = str(step.text) ?? str(step.name);
    if (text) items.push(text);
  }
  return items;
}

function push(details: StructuredData["details"], heading: string, items: (string | null)[]) {
  const clean = items.filter((i): i is string => Boolean(i && i.trim()));
  if (clean.length) details.push({ heading, items: clean });
}

function fromRecipe(node: JsonObj): StructuredData {
  const details: StructuredData["details"] = [];
  push(details, "Ingredients", asArray(node.recipeIngredient).map((i) => str(i)));
  push(details, "Steps", stepsFrom(node.recipeInstructions));
  push(details, "Details", [
    str(node.recipeYield) ? `Yield: ${str(node.recipeYield)}` : null,
    humanDuration(node.prepTime) ? `Prep: ${humanDuration(node.prepTime)}` : null,
    humanDuration(node.cookTime) ? `Cook: ${humanDuration(node.cookTime)}` : null,
    humanDuration(node.totalTime) ? `Total: ${humanDuration(node.totalTime)}` : null,
  ]);
  return {
    name: str(node.name),
    description: str(node.description),
    location: null,
    images: imagesFrom(node.image),
    details,
  };
}

function fromHowTo(node: JsonObj): StructuredData {
  const details: StructuredData["details"] = [];
  push(details, "Steps", stepsFrom(node.step));
  push(
    details,
    "You'll need",
    [...asArray(node.tool), ...asArray(node.supply)].map((t) =>
      typeof t === "string" ? t : isObj(t) ? str(t.name) : null,
    ),
  );
  push(details, "Details", [
    humanDuration(node.totalTime) ? `Total: ${humanDuration(node.totalTime)}` : null,
  ]);
  return {
    name: str(node.name),
    description: str(node.description),
    location: null,
    images: imagesFrom(node.image),
    details,
  };
}

function offerPrice(offers: unknown): string | null {
  const o = asArray(offers).find(isObj);
  if (!o) return null;
  const price = str(o.price) ?? str(o.lowPrice);
  if (!price) return null;
  const cur = str(o.priceCurrency);
  return cur ? `${price} ${cur}` : price;
}

function fromEvent(node: JsonObj): StructuredData {
  const place = isObj(node.location) ? node.location : null;
  const locationName = place ? str(place.name) : null;
  const locationAddr = place ? addressToString(place.address) : null;
  const details: StructuredData["details"] = [];
  push(details, "Event Details", [
    str(node.startDate) ? `Starts: ${str(node.startDate)}` : null,
    str(node.endDate) ? `Ends: ${str(node.endDate)}` : null,
    locationName,
    locationAddr,
    offerPrice(node.offers) ? `Price: ${offerPrice(node.offers)}` : null,
  ]);
  return {
    name: str(node.name),
    description: str(node.description),
    location: [locationName, locationAddr].filter(Boolean).join(", ") || null,
    images: imagesFrom(node.image),
    details,
  };
}

function fromProduct(node: JsonObj): StructuredData {
  const brand = isObj(node.brand) ? str(node.brand.name) : str(node.brand);
  const details: StructuredData["details"] = [];
  push(details, "Product", [
    offerPrice(node.offers) ? `Price: ${offerPrice(node.offers)}` : null,
    brand ? `Brand: ${brand}` : null,
    str(node.sku) ? `SKU: ${str(node.sku)}` : null,
  ]);
  return {
    name: str(node.name),
    description: str(node.description),
    location: null,
    images: imagesFrom(node.image),
    details,
  };
}

function hoursFrom(node: JsonObj): string[] {
  const out: string[] = [];
  for (const spec of asArray(node.openingHoursSpecification)) {
    if (!isObj(spec)) continue;
    const days = asArray(spec.dayOfWeek)
      .map((d) => (typeof d === "string" ? d.replace(/^https?:\/\/schema\.org\//, "") : null))
      .filter(Boolean)
      .join(", ");
    const open = str(spec.opens);
    const close = str(spec.closes);
    if (days && open && close) out.push(`${days}: ${open}–${close}`);
  }
  for (const h of asArray(node.openingHours)) {
    const s = str(h);
    if (s) out.push(s);
  }
  return out;
}

function fromPlace(node: JsonObj): StructuredData {
  const address = addressToString(node.address);
  const details: StructuredData["details"] = [];
  push(details, "Hours", hoursFrom(node));
  push(details, "Info", [
    address,
    str(node.telephone) ? `Phone: ${str(node.telephone)}` : null,
    str(node.priceRange) ? `Price: ${str(node.priceRange)}` : null,
    str(node.servesCuisine) ? `Cuisine: ${str(node.servesCuisine)}` : null,
  ]);
  const name = str(node.name);
  return {
    name,
    description: str(node.description),
    location: [name, address].filter(Boolean).join(", ") || null,
    images: imagesFrom(node.image),
    details,
  };
}

// Type → mapper, in priority order (first matching node wins).
const MAPPERS: { match: (types: string[]) => boolean; map: (node: JsonObj) => StructuredData }[] = [
  { match: (t) => t.includes("recipe"), map: fromRecipe },
  { match: (t) => t.includes("howto"), map: fromHowTo },
  { match: (t) => t.some((x) => x.endsWith("event")), map: fromEvent },
  { match: (t) => t.includes("product"), map: fromProduct },
  {
    match: (t) =>
      t.some(
        (x) =>
          x.includes("localbusiness") ||
          x.includes("restaurant") ||
          x.includes("foodestablishment") ||
          x === "place" ||
          x === "store",
      ),
    map: fromPlace,
  },
];

/**
 * Extract structured bookmark data from parsed JSON-LD. Returns `null` when no
 * recognized type is present or the extraction yielded nothing useful (no
 * name/description and no detail sections) — the caller then uses the LLM.
 */
export function structuredDataFromJsonLd(jsonLd: unknown[]): StructuredData | null {
  const nodes = flatten(jsonLd);
  if (!nodes.length) return null;

  for (const { match, map } of MAPPERS) {
    const node = nodes.find((n) => match(typesOf(n)));
    if (!node) continue;
    const data = map(node);
    if (data.name || data.description || data.details.length) return data;
  }
  return null;
}
