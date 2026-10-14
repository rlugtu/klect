import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

/**
 * Catches render/lifecycle throws anywhere below it so a single bad component shows a recoverable
 * screen instead of white-screening the whole app. Has to be a class — function components can't
 * catch render errors.
 *
 * "Try again" remounts the subtree under a fresh key (clearing the error alone would re-render the
 * same broken tree with the same props). There's no "Restart app" button because `expo-updates`
 * isn't a dependency and RN's `DevSettings.reload()` is a dev-only API, so a release build has no
 * reload primitive to offer.
 *
 * Deliberately local-only: the error goes to the console, not to a crash-reporting service.
 */
type Props = { children: ReactNode };
type State = { error: Error | null; resetKey: number };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error:', error, info.componentStack);
  }

  reset = () => {
    this.setState((prev) => ({ error: null, resetKey: prev.resetKey + 1 }));
  };

  render() {
    const { error, resetKey } = this.state;
    if (!error) {
      // Keyed so `reset` forces a fresh mount of the subtree rather than re-rendering the
      // instances that just threw.
      return <View key={resetKey} style={{ flex: 1 }}>{this.props.children}</View>;
    }

    return (
      <View className="flex-1 items-center justify-center gap-4 bg-bg px-8">
        <Text className="text-center font-serif text-2xl text-ink">Something went wrong</Text>
        <Text className="text-center text-base text-muted">
          Klect hit an unexpected error. Your saved bookmarks are safe.
        </Text>
        {__DEV__ && (
          <Text className="text-center text-xs text-danger">{error.message}</Text>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Try again"
          onPress={this.reset}
          className="items-center rounded-skin bg-primary px-6 py-3">
          <Text className="font-sans-semibold text-base text-primary-ink">Try again</Text>
        </Pressable>
      </View>
    );
  }
}
