import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LogIn, LogOut } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { BrandLogo } from '../brand';
import { OwnerInboxBell } from '../owner/OwnerInboxBell';
import { ThemeToggle } from '../theme/ThemeToggle';
import { Button } from '../ui/Button';
import { cn } from '../ui/cn';
import { PanelAccessNav } from './PanelAccessNav';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

export type PanelHeaderSurface = 'customer' | 'owner';

export interface PanelHeaderProps {
  /** Surface that owns the header and its workspace destination. */
  surface: PanelHeaderSurface;
  /** Accessible brand label; owner shell uses its salon name when available. */
  brandLabel?: string;
  /** Optional custom theme control; owner shell supplies its scoped toggle. */
  themeControl?: React.ReactNode;
  /** Owner shell supplies its auth-aware sign-out/navigation handler. */
  onSignOut?: () => void;
}

/**
 * Shared chrome for customer and salon panels.
 *
 * Both surfaces keep the same order and spacing: brand, workspace switcher,
 * notifications, theme, then authentication. Only the workspace destination
 * and surface-specific sign-out handler differ.
 */
export function PanelHeader({ surface, brandLabel, themeControl, onSignOut }: PanelHeaderProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { status, isStaff, isPlatformAdmin, signOut } = useAuth();

  const isOwnerSurface = surface === 'owner';
  const isAuthenticated = status === 'authenticated';
  const showWorkspace = isOwnerSurface || (isAuthenticated && !isPlatformAdmin);
  const showOwnerInbox = isOwnerSurface || (isAuthenticated && isStaff && !isPlatformAdmin);
  const showAccountLink = !isOwnerSurface && pathname !== '/account' && !isPlatformAdmin;

  const handleSignOut = () => {
    if (onSignOut) {
      onSignOut();
      return;
    }
    signOut();
    navigate('/');
  };

  const authControl =
    isOwnerSurface || isAuthenticated ? (
      <Button
        variant="ghost"
        size="md"
        startIcon={<LogOut className="h-4 w-4 rtl:-scale-x-100" />}
        onClick={handleSignOut}
        data-testid={isOwnerSurface ? 'owner-sign-out' : 'header-sign-out'}
        aria-label={t('app.signOut')}
        className="shrink-0 !px-1 sm:!px-5"
      >
        <span className="hidden sm:inline">{t('app.signOut')}</span>
      </Button>
    ) : status === 'anonymous' ? (
      <Link
        to="/auth"
        data-testid="header-sign-in"
        aria-label={t('app.signIn')}
        className={cn(
          'inline-flex min-h-10 min-w-10 shrink-0 items-center gap-2 rounded-md px-2 py-2',
          'text-sm font-semibold text-text no-underline hover:bg-elevated sm:px-3',
          'outline-none focus-visible:outline focus-visible:outline-2',
          'focus-visible:outline-offset-2 focus-visible:outline-focus',
        )}
      >
        <LogIn className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
        <span className="hidden sm:inline">{t('app.signIn')}</span>
      </Link>
    ) : null;

  return (
    <header className="sticky top-0 z-nav shrink-0 border-b border-border bg-surface text-text">
      <div className="flex w-full items-center justify-between gap-0 px-3 py-1 sm:gap-3 sm:px-4 sm:py-1.5">
        <nav aria-label={t('app.primaryNav')}>
          <Link
            to={isOwnerSurface ? '/owner' : '/'}
            aria-label={brandLabel || (isOwnerSurface ? t('owner.title') : t('app.title'))}
            className="flex min-h-11 shrink-0 items-center rounded-md text-sm font-bold text-text no-underline sm:text-md"
          >
            <BrandLogo className="h-5 w-auto sm:h-6" />
          </Link>
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {isPlatformAdmin ? (
            <PanelAccessNav />
          ) : (
            <>
              {showAccountLink && (
                <Link
                  to="/account"
                  className="flex min-h-10 shrink-0 items-center rounded-md px-2 py-2 text-xs font-semibold text-text no-underline transition-colors duration-fast ease-standard hover:bg-elevated sm:px-3 sm:text-sm"
                >
                  {t('app.account')}
                </Link>
              )}

              {showWorkspace ? (
                <WorkspaceSwitcher
                  surface={isOwnerSurface ? 'owner' : undefined}
                  className="my-0"
                />
              ) : !isOwnerSurface ? (
                <Link
                  to="/business/register"
                  className={cn(
                    'hidden rounded-md px-3 py-2 text-sm font-semibold text-text sm:inline-flex',
                    'transition-colors duration-fast ease-standard hover:bg-elevated',
                    'outline-none focus-visible:outline focus-visible:outline-2',
                    'focus-visible:outline-offset-2 focus-visible:outline-focus',
                  )}
                >
                  ثبت سالن
                </Link>
              ) : null}
            </>
          )}

          {showOwnerInbox && <OwnerInboxBell />}
          {themeControl ?? <ThemeToggle />}
          {authControl}
        </div>
      </div>
    </header>
  );
}

export default PanelHeader;
