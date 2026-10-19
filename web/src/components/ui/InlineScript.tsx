"use client";

/**
 * A script that runs while the server HTML is parsed (before first paint), for
 * correcting the DOM from browser-only state such as localStorage. Pattern from
 * the bundled Next docs (guides/preventing-flash-before-hydration): the server
 * emits `text/javascript`, the client renders `text/plain`, so React neither
 * warns about rendering a script nor runs it again on client renders, and
 * `suppressHydrationWarning` accepts the type difference.
 *
 * It only runs on a full page load. Anything that must also apply after a
 * client-side navigation needs its own client effect beside it.
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
