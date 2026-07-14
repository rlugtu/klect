const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const { withShareExtension } = require("expo-share-extension/metro");

const config = getDefaultConfig(__dirname);

// Layer the share-extension resolver (adds the `index.share` entry as a second bundle)
// under NativeWind so the extension's React root gets the same Tailwind styling.
module.exports = withShareExtension(
  withNativeWind(config, { input: "./src/global.css" }),
);
