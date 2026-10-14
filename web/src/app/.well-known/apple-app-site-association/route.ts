/**
 * Apple App Site Association — the iOS **Universal Links** manifest. Without it, every
 * klect.vercel.app link (notably an `/invite/<token>` share) opens Safari even on a phone
 * with the app installed.
 *
 * A Route Handler rather than a file in `public/`: Apple fetches this at the exact
 * extensionless path `/.well-known/apple-app-site-association` and requires
 * `Content-Type: application/json` with no redirects, and a static file with no extension
 * is served as `application/octet-stream`. `Response.json` sets the right type.
 *
 * `paths` claims only `/invite/*` — the one URL shape the native app has a screen for
 * (`mobile/src/app/invite/[token].tsx`). Every other path keeps opening in the browser;
 * add a path here only once a matching mobile screen exists, or the link dead-ends in-app.
 *
 * The matching native side is `ios.associatedDomains` in `mobile/app.json`, which Apple only
 * honors once it's baked into the provisioning profile by a fresh EAS build.
 */
const APP_ID = "UMPLL5A8L3.com.klect.app";

const ASSOCIATION = {
  applinks: {
    apps: [],
    details: [
      {
        appID: APP_ID,
        paths: ["/invite/*"],
      },
    ],
  },
};

export const dynamic = "force-static";

export function GET() {
  return Response.json(ASSOCIATION);
}
