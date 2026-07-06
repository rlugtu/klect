"use client";

import { useState } from "react";
import { isTrustedIframeUrl, isPortraitVideoHost } from "@/lib/video";

/**
 * Optional inline video player. For embeddable providers it shows a poster
 * facade and only mounts the <iframe> once the user clicks play (no autoplay on
 * load; nothing loads from the provider until then). Direct files use <video>.
 * The trusted-host whitelist is enforced here as defense-in-depth.
 */
export function BookmarkVideo({
  videoUrl,
  videoType,
  poster,
}: {
  videoUrl: string;
  videoType: string;
  poster?: string;
}) {
  const [playing, setPlaying] = useState(false);

  if (!videoUrl) return null;

  if (videoType === "file") {
    return (
      <video
        controls
        preload="metadata"
        poster={poster}
        className="pixel-box-sm bg-panel max-h-96 w-full"
      >
        <source src={videoUrl} />
      </video>
    );
  }

  if (videoType !== "iframe" || !isTrustedIframeUrl(videoUrl)) return null;

  const portrait = isPortraitVideoHost(videoUrl);
  const frame = `pixel-box-sm bg-panel relative w-full ${
    portrait ? "mx-auto aspect-[9/16] max-w-[340px]" : "aspect-video"
  }`;

  if (!playing) {
    return (
      <button
        type="button"
        onClick={() => setPlaying(true)}
        aria-label="Play video"
        className={`${frame} block cursor-pointer overflow-hidden`}
      >
        {poster && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={poster}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        <span className="absolute inset-0 grid place-items-center">
          <span className="pixel-box bg-panel text-primary px-4 py-2 text-2xl">
            ▶
          </span>
        </span>
      </button>
    );
  }

  const src = videoUrl + (videoUrl.includes("?") ? "&" : "?") + "autoplay=1";
  return (
    <div className={frame}>
      <iframe
        src={src}
        title="Embedded video"
        className="absolute inset-0 h-full w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        loading="lazy"
      />
    </div>
  );
}
