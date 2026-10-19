"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { RemoteImg } from "@/components/ui/RemoteImg";
import { BookmarkThumb } from "./BookmarkThumb";

/**
 * Photo gallery for the desktop bookmark views: one photo at a time with
 * previous/next buttons and a dot per photo. Images are hotlinked remote URLs
 * (see web/CLAUDE.md), so this is a plain <img>, same as the mobile detail.
 * A photo that fails to load drops out of the set (and the counter); if none
 * load, the frame shows the same designed tile as every other thumbnail.
 * Arrow keys are deliberately not bound here: in the side panel they step
 * between bookmarks.
 */
export function BookmarkGallery({
  images: allImages,
  url,
  name,
  className,
}: {
  images: string[];
  /** The bookmark's primary link and name, for the all-failed tile. */
  url?: string | null;
  name?: string | null;
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  if (allImages.length === 0) return null;
  const images = allImages.filter((src) => !failed.has(src));
  if (images.length === 0) {
    return (
      <BookmarkThumb
        images={[]}
        url={url}
        name={name}
        size="lg"
        className={cn("pixel-box-sm aspect-[4/3] w-full", className)}
      />
    );
  }
  const markFailed = (src: string) =>
    setFailed((prev) => (prev.has(src) ? prev : new Set(prev).add(src)));
  const i = Math.min(index, images.length - 1);
  const many = images.length > 1;
  const nav =
    "bg-panel/85 text-ink pixel-box-sm absolute top-1/2 inline-flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center";

  return (
    <div
      role="group"
      aria-roledescription="carousel"
      aria-label={`Photos, ${i + 1} of ${images.length}`}
      className={cn("relative", className)}
    >
      <RemoteImg
        key={images[i]}
        src={images[i]}
        onFail={() => markFailed(images[i])}
        className="pixel-box-sm bg-panel block aspect-[4/3] w-full object-cover"
      />
      {many && (
        <>
          <button
            type="button"
            aria-label="Previous photo"
            onClick={() => setIndex((i - 1 + images.length) % images.length)}
            className={cn(nav, "left-2")}
          >
            <ChevronLeft size={18} aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Next photo"
            onClick={() => setIndex((i + 1) % images.length)}
            className={cn(nav, "right-2")}
          >
            <ChevronRight size={18} aria-hidden />
          </button>
          <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
            {images.map((src, n) => (
              <button
                key={src}
                type="button"
                aria-label={`Photo ${n + 1}`}
                aria-current={n === i ? "true" : undefined}
                onClick={() => setIndex(n)}
                className={cn(
                  "border-border h-2 cursor-pointer rounded-full border transition-all",
                  n === i ? "bg-primary w-5" : "bg-panel w-2",
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The full bookmark page's photo grid below lg (one photo, or two columns).
 * Same markup as before; a photo that fails to load drops out, and if none
 * load, the designed tile takes the single-photo slot.
 */
export function BookmarkPhotoGrid({
  images: allImages,
  url,
  name,
}: {
  images: string[];
  url?: string | null;
  name?: string | null;
}) {
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  if (allImages.length === 0) return null;
  const images = allImages.filter((src) => !failed.has(src));
  if (images.length === 0) {
    return (
      <BookmarkThumb
        images={[]}
        url={url}
        name={name}
        size="lg"
        className="pixel-box-sm h-40 w-full"
      />
    );
  }
  const many = images.length > 1;
  return (
    <div className={cn("grid gap-2", many ? "grid-cols-2" : "grid-cols-1")}>
      {images.map((src) => (
        <RemoteImg
          key={src}
          src={src}
          loading="lazy"
          onFail={() =>
            setFailed((prev) => (prev.has(src) ? prev : new Set(prev).add(src)))
          }
          className={cn(
            "pixel-box-sm bg-panel w-full object-cover",
            many ? "h-40" : "max-h-72",
          )}
        />
      ))}
    </div>
  );
}
