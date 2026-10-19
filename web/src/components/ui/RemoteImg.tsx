"use client";

import { useCallback, type ImgHTMLAttributes } from "react";

type RemoteImgProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "src" | "onError" | "referrerPolicy" | "alt"
> & {
  src: string;
  alt?: string;
  /** Called once when the image cannot be loaded (404, 403, hotlink refusal, not an image). */
  onFail: () => void;
};

/**
 * A plain <img> for a third-party URL (bookmark photos are hotlinked, see
 * web/CLAUDE.md). Not next/image on purpose: the hosts are arbitrary, so the
 * optimizer would need a wildcard `remotePatterns` (an open image proxy billed
 * per transform).
 *
 * - `referrerPolicy="no-referrer"`: many CDNs refuse requests whose Referer is
 *   another site (hotlink protection). With no Referer they treat the load like
 *   a direct visit, which is what a lot of them allow.
 * - Failure is reported through `onFail`, including a failure that happened
 *   before React hydrated (the browser fires `error` on server-rendered markup
 *   before any handler is attached, so the ref checks `complete` with no pixels).
 */
export function RemoteImg({ src, alt = "", onFail, ...rest }: RemoteImgProps) {
  const checkAlreadyFailed = useCallback(
    (el: HTMLImageElement | null) => {
      if (el && el.complete && el.naturalWidth === 0 && el.currentSrc) onFail();
    },
    [onFail],
  );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...rest}
      ref={checkAlreadyFailed}
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      decoding="async"
      onError={onFail}
    />
  );
}
