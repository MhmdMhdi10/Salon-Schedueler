/**
 * Theme module barrel: the ThemeProvider (persisted light/dark with OS
 * fallback) and the header ThemeToggle. See `.kiro/steering/ui-ux-skills.md`
 * §2 (theming rules) and R1.8 / R3.3 / R3.4 / R11.4.
 */
export {
  ThemeProvider,
  useTheme,
  THEME_STORAGE_KEY,
  ThemeScope,
  useThemeScope,
} from './ThemeProvider';
export type { Theme, ThemeProviderProps, ThemeScopeProps } from './ThemeProvider';
export { ThemeToggle } from './ThemeToggle';
export type { ThemeToggleProps } from './ThemeToggle';
export { OwnerThemeToggle } from './OwnerThemeToggle';
export type { OwnerThemeToggleProps } from './OwnerThemeToggle';

/**
 * Tenant theming (signature-ui-system R4): a scoped runtime wrapper that
 * overrides the four accent-related CSS custom properties for a storefront
 * subtree, plus the pure derivation of that override map from an `AccentTheme`.
 */
export { TenantTheme } from './TenantTheme';
export type { TenantThemeProps } from './TenantTheme';
export { deriveTenantTokens } from './tenantTokens';
export { FunnelTenantTheme } from './FunnelTenantTheme';
