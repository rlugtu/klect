import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { Image } from 'expo-image';

import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';

/**
 * A short, illustrated "how to add Klect to your iOS Share Sheet" walkthrough — pushed from the
 * Settings screen (iOS only). Purely static content: four steps, one screenshot each. The
 * screenshots live in assets/images/share-help and are shared, verbatim, with the web help page.
 */
const STEPS: { title: string; body: string; image: number; aspect: number }[] = [
  {
    title: 'Open the Share menu',
    body: 'In any app, tap Share. In Safari you can also press and hold a link, then tap Share.',
    image: require('@/assets/images/share-help/step-1.png'),
    aspect: 0.46,
  },
  {
    title: 'Tap “More”',
    body: 'In the share sheet, swipe the row of app icons to the end and tap More.',
    image: require('@/assets/images/share-help/step-2.png'),
    aspect: 0.46,
  },
  {
    title: 'Turn on Klect',
    body: 'Tap Edit, add Klect to your Favorites, then tap the checkmark.',
    image: require('@/assets/images/share-help/step-3.png'),
    aspect: 1.08,
  },
  {
    title: 'Save to Klect',
    body: 'Klect now shows in your share sheet — tap it, pick your lists, and save.',
    image: require('@/assets/images/share-help/step-4.png'),
    aspect: 0.46,
  },
];

export default function ShareHelpScreen() {
  const { theme } = useTheme();
  const t = THEME_TOKENS[theme];
  const headerHeight = useHeaderHeight();

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['left', 'right']} className="bg-bg">
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingTop: headerHeight + 8,
          paddingBottom: 40,
          gap: 24,
        }}>
        <View className="gap-2">
          <Text className="font-serif text-3xl text-ink">Share to Klect</Text>
          <Text className="text-base text-muted">
            Save links to Klect from any app — no copy-pasting.
          </Text>
        </View>

        {STEPS.map((step, i) => (
          <View key={i} className="gap-3">
            <View className="flex-row items-center gap-3">
              <View
                style={{ backgroundColor: t.primary }}
                className="h-8 w-8 items-center justify-center rounded-full">
                <Text style={{ color: t.primaryInk }} className="font-sans-semibold text-base">
                  {i + 1}
                </Text>
              </View>
              <Text className="flex-1 font-sans-semibold text-lg text-ink">{step.title}</Text>
            </View>

            <Text className="text-base text-muted">{step.body}</Text>

            <View className="items-center">
              <View
                style={{ width: step.aspect < 1 ? '64%' : '100%' }}
                className="overflow-hidden rounded-skin border-skin border-border bg-panel">
                <Image
                  source={step.image}
                  style={{ width: '100%', aspectRatio: step.aspect }}
                  contentFit="cover"
                  transition={150}
                />
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
