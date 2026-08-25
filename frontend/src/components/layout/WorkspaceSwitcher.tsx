import { Building2, Store, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { cn } from '../ui/cn';

export type WorkspaceSurface = 'owner';
export type WorkspaceSwitcherVariant = 'header' | 'card';

export interface WorkspaceSwitcherProps {
  /** Known current surface. OwnerShell passes this so the link is available while auth rehydrates. */
  surface?: WorkspaceSurface;
  /** Visual treatment for shell chrome versus a prominent dashboard action. */
  variant?: WorkspaceSwitcherVariant;
  className?: string;
  testId?: string;
}

/**
 * Single alternate-workspace action shared by public/customer and owner
 * surfaces:
 * - staff can jump to their customer account or salon panel;
 * - customers without a salon get a visible salon-registration entry point.
 */
export function WorkspaceSwitcher({
  surface,
  variant = 'header',
  className,
  testId,
}: WorkspaceSwitcherProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { status, isStaff, isPlatformAdmin } = useAuth();

  const isOwnerSurface =
    surface === 'owner' || pathname === '/owner' || pathname.startsWith('/owner/');
  const canRender = surface === 'owner' || (status === 'authenticated' && !isPlatformAdmin);

  if (!canRender) return null;

  const isStaffSurface = surface === 'owner' || isStaff;
  const destination = isStaffSurface
    ? isOwnerSurface
      ? { to: '/account', label: t('app.workspace.userPanel'), Icon: UserRound }
      : { to: '/owner', label: t('app.workspace.salonPanel'), Icon: Building2 }
    : { to: '/business/register', label: t('app.workspace.registerSalon'), Icon: Store };
  const Icon = destination.Icon;

  const linkClass =
    variant === 'card'
      ? cn(
          'inline-flex min-h-11 w-fit shrink-0 items-center justify-center gap-2 rounded-pill',
          'bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast no-underline',
          'transition-opacity duration-fast ease-standard hover:opacity-90',
          'outline-none focus-visible:outline focus-visible:outline-2',
          'focus-visible:outline-offset-2 focus-visible:outline-focus',
        )
      : cn(
          'inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md border border-border',
          'bg-surface px-2 py-2 text-xs font-semibold text-text no-underline sm:px-3 sm:text-sm',
          'transition-colors duration-fast ease-standard hover:bg-elevated',
          'outline-none focus-visible:outline focus-visible:outline-2',
          'focus-visible:outline-offset-2 focus-visible:outline-focus',
        );

  return (
    <nav
      aria-label={t('app.workspace.navigation')}
      data-testid={testId}
      className={cn('flex shrink-0 items-center', className)}
    >
      <Link to={destination.to} className={linkClass}>
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{destination.label}</span>
      </Link>
    </nav>
  );
}

export default WorkspaceSwitcher;
