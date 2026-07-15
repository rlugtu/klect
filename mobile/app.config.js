// Extends the static app.json so the Mapbox native SDK's *download* token — a
// secret (sk.…, scope DOWNLOADS:READ) needed only at prebuild/build time — is
// injected from the environment instead of being committed. Expo loads .env
// into process.env before resolving the config, so MAPBOX_DOWNLOAD_TOKEN in
// mobile/.env is picked up here. Everything else stays in app.json; `config`
// arrives pre-populated from it.
module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins ?? []),
    [
      '@rnmapbox/maps',
      {
        RNMapboxMapsDownloadToken: process.env.MAPBOX_DOWNLOAD_TOKEN ?? '',
      },
    ],
  ],
});
