import { useState } from 'react';
import { Pressable, Text, View, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { WebView } from 'react-native-webview';

import { isPortraitVideoHost, isTrustedIframeUrl } from '@/lib/video-embed';
import { cardShadow } from '@/theme/shadows';

/**
 * Inline bookmark video player — the RN analogue of web's `BookmarkVideo`.
 * Providers (`videoType === "iframe"`) load in a WebView-hosted iframe; direct
 * media (`videoType === "file"`) uses expo-video. Both use a click-to-play
 * facade (poster + ▶) so nothing heavy mounts until the user taps. The
 * trusted-host whitelist is re-checked here as defense-in-depth.
 */
export default function BookmarkVideo({
  videoUrl,
  videoType,
  poster,
}: {
  videoUrl: string;
  videoType: string;
  poster?: string;
}) {
  if (!videoUrl) return null;
  if (videoType === 'file') return <FileVideo url={videoUrl} poster={poster} />;
  if (videoType !== 'iframe' || !isTrustedIframeUrl(videoUrl)) return null;
  return <IframeVideo url={videoUrl} poster={poster} />;
}

// The image card's outer/inner chrome, matched to the header image in [id].tsx.
function Card({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={cardShadow}
      className="overflow-hidden rounded-skin border-skin border-border bg-panel p-1.5">
      <View className="overflow-hidden rounded-skin-sm">{children}</View>
    </View>
  );
}

function PlayFacade({
  poster,
  onPress,
  style,
}: {
  poster?: string;
  onPress: () => void;
  style: ViewStyle;
}) {
  return (
    <Pressable onPress={onPress} accessibilityLabel="Play video" style={style}>
      {poster ? (
        <Image
          source={poster}
          style={{ position: 'absolute', inset: 0 }}
          contentFit="cover"
          transition={150}
        />
      ) : null}
      <View className="flex-1 items-center justify-center">
        <View className="rounded-skin-sm border-skin border-border bg-panel px-5 py-2">
          <Text className="text-2xl text-primary">▶</Text>
        </View>
      </View>
    </Pressable>
  );
}

function IframeVideo({ url, poster }: { url: string; poster?: string }) {
  const [playing, setPlaying] = useState(false);
  const portrait = isPortraitVideoHost(url);
  const style: ViewStyle = portrait
    ? { width: '100%', maxWidth: 340, aspectRatio: 9 / 16, alignSelf: 'center' }
    : { width: '100%', aspectRatio: 16 / 9 };

  if (!playing) {
    return (
      <Card>
        <PlayFacade poster={poster} onPress={() => setPlaying(true)} style={style} />
      </Card>
    );
  }

  const src = url + (url.includes('?') ? '&' : '?') + 'autoplay=1';
  const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"><style>*{margin:0;padding:0}html,body{height:100%;background:#000;overflow:hidden}.wrap{position:absolute;top:0;right:0;bottom:0;left:0}iframe{border:0;width:100%;height:100%}</style></head><body><div class="wrap"><iframe src="${src}" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture;fullscreen" allowfullscreen></iframe></div></body></html>`;

  return (
    <Card>
      <View style={style}>
        <WebView
          source={{ html, baseUrl: 'https://klect.app' }}
          originWhitelist={['*']}
          style={{ flex: 1, backgroundColor: '#000' }}
          javaScriptEnabled
          domStorageEnabled
          scrollEnabled={false}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          allowsFullscreenVideo
        />
      </View>
    </Card>
  );
}

function FileVideo({ url, poster }: { url: string; poster?: string }) {
  const [playing, setPlaying] = useState(false);
  const style: ViewStyle = { width: '100%', aspectRatio: 16 / 9 };

  if (!playing) {
    return (
      <Card>
        <PlayFacade poster={poster} onPress={() => setPlaying(true)} style={style} />
      </Card>
    );
  }
  return (
    <Card>
      <FilePlayer url={url} style={style} />
    </Card>
  );
}

// Scoped so `useVideoPlayer` only runs (and buffers) once the user taps play.
function FilePlayer({ url, style }: { url: string; style: ViewStyle }) {
  const player = useVideoPlayer(url, (p) => {
    p.play();
  });
  return (
    <VideoView
      player={player}
      style={style}
      contentFit="cover"
      nativeControls
      allowsFullscreen
    />
  );
}
