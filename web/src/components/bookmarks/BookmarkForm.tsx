"use client";

import { useState } from "react";
import { PixelInput } from "@/components/ui/PixelInput";
import { PixelTextarea } from "@/components/ui/PixelTextarea";
import { PixelButton } from "@/components/ui/PixelButton";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { RatingInput } from "./RatingInput";
import { TagInput } from "./TagInput";
import { LocationInput } from "./LocationInput";
import { fetchLinkMetadata } from "@/lib/actions/metadata";
import type { RetrievedPlace } from "@/lib/actions/places";

export type BookmarkDefaults = {
  name: string;
  urls: string; // newline-joined
  images: string[];
  location: string;
  latitude: number | null;
  longitude: number | null;
  rating: number;
  visited: boolean;
  description: string;
  notes: string;
  tags: string[];
  videoUrl: string;
  videoType: string;
};

const Field = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <label className="flex flex-col gap-1.5">
    <FieldLabel>{label}</FieldLabel>
    {children}
  </label>
);

export function BookmarkForm({
  action,
  defaults,
  submitLabel,
  tagSuggestions = [],
  existingTags = [],
  tagColors = {},
}: {
  action: (formData: FormData) => void | Promise<void>;
  defaults?: Partial<BookmarkDefaults>;
  submitLabel: string;
  tagSuggestions?: string[];
  existingTags?: string[];
  tagColors?: Record<string, string>;
}) {
  const [name, setName] = useState(defaults?.name ?? "");
  const [urls, setUrls] = useState(defaults?.urls ?? "");
  const [description, setDescription] = useState(defaults?.description ?? "");
  const [images, setImages] = useState<string[]>(defaults?.images ?? []);
  const [videoUrl, setVideoUrl] = useState(defaults?.videoUrl ?? "");
  const [videoType, setVideoType] = useState(defaults?.videoType ?? "");

  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addSourceUrl(source: string) {
    setUrls((prev) => {
      const lines = prev
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.includes(source)) return prev;
      return [source, ...lines].join("\n");
    });
  }

  async function autofill() {
    if (!link.trim() || loading) return;
    setLoading(true);
    setError(null);

    const result = await fetchLinkMetadata(link);
    setLoading(false);
    console.log("[autofill] link:", link, "→ result:", result);

    // Always keep the original source link, even on failure.
    addSourceUrl(result.ok ? result.data.sourceUrl : result.sourceUrl);

    if (!result.ok) {
      setError(`${result.error} You can still fill it in manually.`);
      return;
    }

    const d = result.data;
    if (d.title) setName(d.title);
    if (d.description) setDescription(d.description);
    if (d.images.length) {
      setImages((prev) => [...new Set([...d.images, ...prev])]);
    }
    if (d.video) {
      setVideoUrl(d.video.url);
      setVideoType(d.video.type);
    }
    setLink("");
  }

  // Autofill the bookmark when a business is picked in the Location field. Each pick overwrites
  // the managed fields to reflect the newly-picked business (name/url/description/images/video),
  // then enriches from the website unfurl when present. Location/coords are set by LocationInput.
  async function handleLocationAutofill(place: RetrievedPlace) {
    if (!place.isPoi) return; // plain address — location only, unchanged behavior

    // Overwrite the managed fields to reflect the newly-picked business.
    setName(place.name);
    setUrls(place.website); // "" clears the field when the business has no site
    setDescription(place.category); // provisional; the unfurl may replace it
    setImages([]);
    setVideoUrl("");
    setVideoType("");

    if (!place.website) return;

    setLoading(true);
    const result = await fetchLinkMetadata(place.website);
    setLoading(false);
    if (!result.ok) return; // keep the basics set above

    const d = result.data;
    if (d.title && !place.name) setName(d.title);
    if (d.description) setDescription(d.description);
    if (d.images.length) setImages(d.images);
    if (d.video) {
      setVideoUrl(d.video.url);
      setVideoType(d.video.type);
    }
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      {/* Autofill shortcut — start from a link or a place, then edit anything below. */}
      <section
        aria-label="Autofill"
        className="pixel-box-sm bg-primary/10 flex flex-col gap-3 p-4"
      >
        <div className="flex flex-col gap-0.5">
          <span className="font-pixel text-sm font-bold uppercase">
            ✨ Autofill
          </span>
          <span className="text-muted text-sm">
            Start from a link or a place — we&apos;ll fill the rest.
          </span>
        </div>

        {/* From a link */}
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-2">
            <PixelInput
              value={link}
              onChange={(e) => setLink(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void autofill();
                }
              }}
              placeholder="YouTube · Letterboxd · TikTok · Instagram · blog…"
            />
            <PixelButton
              type="button"
              size="sm"
              onClick={() => void autofill()}
              disabled={loading}
            >
              {loading ? "…" : "Autofill"}
            </PixelButton>
          </div>
          {error && <p className="text-danger text-sm">{error}</p>}
        </div>

        {/* divider */}
        <div className="flex items-center gap-3" aria-hidden>
          <span className="border-border flex-1 border-t-2" />
          <span className="font-pixel text-muted text-xs uppercase">or</span>
          <span className="border-border flex-1 border-t-2" />
        </div>

        {/* From a place */}
        <div className="flex flex-col gap-1.5">
          <LocationInput
            initialLocation={defaults?.location ?? ""}
            initialLat={defaults?.latitude ?? null}
            initialLon={defaults?.longitude ?? null}
            onAutofill={handleLocationAutofill}
          />
          <p className="text-muted text-sm">
            Pick a business to autofill its name, photos &amp; details.
          </p>
        </div>
      </section>

      <div className="relative">
        {loading && (
          <div className="absolute inset-0 z-10 grid place-items-center">
            <div className="pixel-box-sm bg-panel flex items-center gap-3 px-4 py-2">
              <span
                aria-hidden
                className="border-border border-t-primary size-4 animate-spin rounded-full border-2"
              />
              <span className="font-pixel text-sm uppercase">
                Fetching link…
              </span>
            </div>
          </div>
        )}
        <fieldset
          disabled={loading}
          aria-busy={loading}
          className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0 transition-opacity disabled:opacity-40"
        >
          <div className="flex flex-col gap-1.5">
            <FieldLabel>Name *</FieldLabel>
            <PixelInput
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ramen Nagi"
              required
            />
          </div>

          {images.length > 0 && (
            <div className="flex flex-col gap-2">
              <FieldLabel>Photos</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {images.map((src) => (
                  <div key={src} className="relative">
                    <input type="hidden" name="images" value={src} />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt=""
                      loading="lazy"
                      className="pixel-box-sm bg-panel h-20 w-20 object-cover"
                    />
                    <button
                      type="button"
                      aria-label="Remove photo"
                      onClick={() =>
                        setImages((prev) => prev.filter((i) => i !== src))
                      }
                      className="bg-danger text-primary-ink border-border absolute -right-2 -top-2 h-5 w-5 cursor-pointer border-2 text-sm leading-none"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {videoUrl && (
            <div className="flex flex-col gap-2">
              <input type="hidden" name="videoUrl" value={videoUrl} />
              <input type="hidden" name="videoType" value={videoType} />
              <div className="flex items-center justify-between gap-3">
                <span className="font-pixel text-sm uppercase">
                  🎬 Video detected
                </span>
                <PixelButton
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setVideoUrl("");
                    setVideoType("");
                  }}
                >
                  Remove
                </PixelButton>
              </div>
            </div>
          )}

          <Field label="URLs (one per line, first is the source link)">
            <PixelTextarea
              name="urls"
              rows={2}
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
              placeholder="https://…"
            />
          </Field>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-col gap-1.5">
              <FieldLabel>Rating</FieldLabel>
              <RatingInput defaultValue={defaults?.rating ?? 0} />
            </div>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                name="visited"
                defaultChecked={defaults?.visited ?? false}
                className="accent-primary h-5 w-5"
              />
              <FieldLabel>Visited</FieldLabel>
            </label>
          </div>

          <Field label="Description">
            <PixelTextarea
              name="description"
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Best tonkotsu in town"
            />
          </Field>

          <Field label="Notes">
            <PixelTextarea
              name="notes"
              rows={3}
              defaultValue={defaults?.notes ?? ""}
              placeholder="Go early to avoid the queue…"
            />
          </Field>

          <div className="flex flex-col gap-2">
            <FieldLabel>Tags</FieldLabel>
            <TagInput
              defaultValue={defaults?.tags ?? []}
              suggestions={tagSuggestions}
              existing={existingTags}
              tagColors={tagColors}
            />
          </div>

          <SubmitButton label={submitLabel} pendingLabel="Saving…" />
        </fieldset>
      </div>
    </form>
  );
}
