/**
 * Mobile design-system theme surface.
 *
 * Re-exports the React Native theme (built from `@salon/shared` tokens) and the
 * ThemeProvider/useTheme hook so screens import brand values from one place.
 */
export {
  buildTheme,
  lightTheme,
  darkTheme,
  themes,
  rnTypeScale,
  persianTextBaseline,
} from './theme';
export type {
  RnTheme,
  RnTypeScale,
  RnTypeVariant,
  PersianTextBaseline,
} from './theme';
export { ThemeProvider, useTheme } from './ThemeProvider';
export type { ThemeProviderProps } from './ThemeProvider';
