/**
 * Theme module barrel: the ThemeProvider (persisted light/dark with OS
 * fallback) and the header ThemeToggle. See `.kiro/steering/ui-ux-skills.md`
 * §2 (theming rules) and R1.8 / R3.3 / R3.4 / R11.4.
 */
export {
  ThemeProvider,
  useTheme,
  THEME_STORAGE_KEY,
} from './ThemeProvider';
export type { Theme, ThemeProviderProps } from './ThemeProvider';
export { ThemeToggle } from './ThemeToggle';
export type { ThemeToggleProps } from './ThemeToggle';
