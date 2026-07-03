"use client";

import { useState } from "react";
import { PixelInput } from "@/components/ui/PixelInput";
import { PixelTextarea } from "@/components/ui/PixelTextarea";
import { PixelButton } from "@/components/ui/PixelButton";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { RatingInput } from "./RatingInput";
import { TagInput } from "./TagInput";
import { fetchLinkMetadata } from "@/lib/actions/metadata";

export type BookmarkDefaults = {
  name: string;
  urls: string; // newline-joined
  images: string[];
  location: string;
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
    <span className="font-pixel text-sm uppercase">{label}</span>
    {children}
  </label>
);

export function BookmarkForm({
  action,
  defaults,
  submitLabel,
  tagSuggestions = [],
  existingTags = [],
}: {
  action: (formData: FormData) => void | Promise<void>;
  defaults?: Partial<BookmarkDefaults>;
  submitLabel: string;
  tagSuggestions?: string[];
  existingTags?: string[];
}) {
  const [name, setName] = useState(defaults?.name ?? "");
  const [urls, setUrls] = useState(defaults?.urls ?? "");
  const [location, setLocation] = useState(defaults?.location ?? "");
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

  return (
    <form action={action} className="flex flex-col gap-4">
      {/* Paste-to-autofill */}
      <div className="flex flex-col gap-1.5">
        <span className="font-pixel text-sm uppercase">
          Paste a link to autofill
        </span>
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
            placeholder="YouTube · TikTok · Instagram · blog…"
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

      <div className="flex flex-col gap-1.5">
        <span className="font-pixel text-sm uppercase">Name *</span>
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
          <span className="font-pixel text-sm uppercase">Photos</span>
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

      <Field label="Location">
        <PixelInput
          name="location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Tokyo, Japan"
        />
      </Field>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="font-pixel text-sm uppercase">Rating</span>
          <RatingInput defaultValue={defaults?.rating ?? 0} />
        </div>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            name="visited"
            defaultChecked={defaults?.visited ?? false}
            className="accent-primary h-5 w-5"
          />
          <span className="font-pixel text-sm uppercase">Visited</span>
        </label>
      </div>

      <Field label="Description">
        <PixelTextarea
          name="description"
          rows={2}
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
        <span className="font-pixel text-sm uppercase">Tags</span>
        <TagInput
          defaultValue={defaults?.tags ?? []}
          suggestions={tagSuggestions}
          existing={existingTags}
        />
      </div>

      <SubmitButton label={submitLabel} pendingLabel="Saving…" />
    </form>
  );
}
