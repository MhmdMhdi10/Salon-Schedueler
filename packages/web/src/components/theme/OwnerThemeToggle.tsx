import { Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../ui/IconButton';
import type { Theme } from './ThemeProvider';

export interface OwnerThemeToggleProps {
  /** The current owner-panel theme (scoped, not the app-wide one). */
  theme: Theme;
  /** Callback to toggle between light and dark within the owner panel. */
  onToggle: () => void;
  /** Optional className passed through to the underlying icon button. */
  className?: string;
}

/**
 * Owner-panel scoped theme toggle (Task 7.7; Req 8.1).
 *
 * Unlike the global `ThemeToggle` which consumes the app-wide ThemeContext, this
 * component operates on the owner-specific theme state managed by `OwnerShell`.
 * The owner panel defaults to dark (NYC SaaS aesthetic) and persists its choice
 * to a separate localStorage key (`owner-theme`) so it doesn't affect the
 * customer-facing light-first theme.
 *
 * Built on `IconButton` — keeps ≥44×44 target, focus-visible ring, and variant
 * styling. Sun and moon are universal icons — not mirrored in RTL.
 */
export function OwnerThemeToggle({
  theme,
  onToggle,
  className,
}: OwnerThemeToggleProps) {
  const { t } = useTranslation();
  const isDark = theme === 'dark';

  const label = isDark
    ? t('common.theme.switchToLight')
    : t('common.theme.switchToDark');

  return (
    <IconButton
      aria-label={label}
      aria-pressed={isDark}
      title={label}
      onClick={onToggle}
      className={className}
      data-testid="owner-theme-toggle"
    >
      {isDark ? (
        <Sun aria-hidden="true" size={20} />
      ) : (
        <Moon aria-hidden="true" size={20} />
      )}
    </IconButton>
  );
}
