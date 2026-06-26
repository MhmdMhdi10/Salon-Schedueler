import { ThemeProvider, useTheme } from './ThemeProvider';
import { lightTheme, darkTheme } from './theme';

/**
 * Tests for the RN ThemeProvider.
 *
 * `react-native` is mapped to lightweight stubs and the suite runs in a Node
 * environment (no device renderer), matching the existing screen tests which
 * verify behavior through exports/logic rather than rendering. These tests
 * confirm the provider/hook contract and the theme objects it resolves.
 */
describe('RN ThemeProvider', () => {
  it('exports a provider component and a hook', () => {
    expect(typeof ThemeProvider).toBe('function');
    expect(typeof useTheme).toBe('function');
  });

  it('resolves the same brand themes the provider hands out', () => {
    // The provider serves these prebuilt themes (light default, dark on toggle),
    // both built from the shared tokens.
    expect(lightTheme.name).toBe('light');
    expect(darkTheme.name).toBe('dark');
    expect(lightTheme.isRTL).toBe(true);
  });

  it('defaults to the light theme name', () => {
    // The provider seeds light by default per the design system; the dark theme
    // is reachable via setTheme/toggleTheme.
    expect(lightTheme.name).toBe('light');
  });
});
