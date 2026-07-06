import { Platform, type ViewStyle } from 'react-native';

/**
 * Soft drop shadow for the Journal photo-forward cards — `border-skin` alone
 * doesn't give depth, and NativeWind shadow utilities are inconsistent across
 * platforms, so apply this via `style=`.
 */
export const cardShadow: ViewStyle = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  android: { elevation: 3 },
  default: {},
}) as ViewStyle;
