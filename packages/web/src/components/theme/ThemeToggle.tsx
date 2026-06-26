import { Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../ui/IconButton';
import { useTheme } from './ThemeProvider';

export interface ThemeToggleProps {
  /** Optional className passed through to the underlying icon button. */
  className?: string;
}

/**
 * Header control that flips and persists the light/dark choice (R3.3, R1.8).
 *
 * Built on `IconButton`, so it keeps the ≥44×44 target, focus-visible ring, and
 * variant styling. The accessible name describes the action ("switch to dark/
 * light"), and `aria-pressed` exposes the dark state to assistive tech. Sun and
 * moon are universal icons — not mirrored in RTL. Switching is instant: only
 * token values change, so there is no reload and no layout shift.
 */
export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
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
      onClick={toggleTheme}
      className={className}
    >
      {isDark ? (
        <Sun aria-hidden="true" size={20} />
      ) : (
        <Moon aria-hidden="true" size={20} />
      )}
    </IconButton>
  );
}
