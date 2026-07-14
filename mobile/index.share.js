import { AppRegistry, Text, TextInput } from 'react-native';

import ShareExtension from './src/share-extension';

// expo-share-extension's Xcode bundling phase hardcodes ENTRY_FILE="index.share.js", so this entry
// must be a literal `.js` file (the actual UI lives in src/share-extension.tsx, resolved through the
// module graph). Kept as plain JS — no JSX/types here — for the same reason.

// Inside a share extension, RN's default font scaling can mis-size text (a documented
// expo-share-extension quirk). Disable it globally so the reused BookmarkForm — which renders RN's
// own <Text>/<TextInput> — lays out correctly without modifying the shared component. Text/TextInput
// are class components, so defaultProps still applies under React 19.
function disableFontScaling(Component) {
  Component.defaultProps = {
    ...(Component.defaultProps ?? {}),
    allowFontScaling: false,
  };
}
disableFontScaling(Text);
disableFontScaling(TextInput);

AppRegistry.registerComponent('shareExtension', () => ShareExtension);
