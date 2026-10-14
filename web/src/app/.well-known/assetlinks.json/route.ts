/**
 * Digital Asset Links — the Android **App Links** manifest, the counterpart to the AASA file
 * next door. Android verifies this against the signing certificate of the installed app, so
 * the fingerprint below must be the one the shipping (release) build is actually signed with.
 *
 * TODO(ryan): the fingerprint is a placeholder. The real one lives in EAS's managed Android
 * credentials, not in this repo — run `eas credentials` in `mobile/` (Android → production →
 * keystore) and paste the **SHA-256 Fingerprint** here, uppercase hex with colons, e.g.
 * "AA:BB:CC:…". Until that lands, Android link verification fails and klect.vercel.app links
 * keep opening the browser on Android (iOS is unaffected — it reads the AASA file instead).
 * If a Play-managed signing key is used, take the fingerprint from Play Console → Setup → App
 * signing instead, since that is the cert users' installs are signed with.
 */
const RELEASE_SHA256_FINGERPRINT = "REPLACE_WITH_RELEASE_SHA256_FINGERPRINT";

const STATEMENTS = [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: "com.klect.app",
      sha256_cert_fingerprints: [RELEASE_SHA256_FINGERPRINT],
    },
  },
];

export const dynamic = "force-static";

export function GET() {
  return Response.json(STATEMENTS);
}
