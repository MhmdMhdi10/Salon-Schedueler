import { useTranslation } from 'react-i18next';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { LogIn, LogOut } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../ui/Button';
import { cn } from '../ui/cn';

/** A single header destination. */
interface HeaderNavItem {
  /** i18n key for the visible label. */
  labelKey: string;
  to: string;
  /** Match the route exactly (used for the customer "home" link). */
  end?: boolean;
}

/**
 * Destinations a signed-in **customer** sees in the header. Customers have no
 * staff panel; their surface is the account dashboard, so we point them at
 * appointments and saved salons.
 */
const CUSTOMER_NAV: readonly HeaderNavItem[] = [
  { labelKey: 'app.nav.account', to: '/account', end: true },
];

const STAFF_NAV = [
  { labelKey: 'owner.nav.calendar', to: '/owner/calendar', roles: ['Owner', 'Admin', 'Stylist'] },
  { labelKey: 'owner.nav.analytics', to: '/owner/analytics', roles: ['Owner', 'Admin'] },
  { labelKey: 'owner.nav.configuration', to: '/owner/config', roles: ['Owner'] },
  { labelKey: 'owner.nav.subscription', to: '/owner/subscription', roles: ['Owner', 'Admin'] },
  { labelKey: 'owner.nav.qr', to: '/owner/qr', roles: ['Owner', 'Admin'] },
  { labelKey: 'owner.nav.myQr', to: '/owner/my-qr', roles: ['Owner', 'Admin', 'Stylist'] },
] as const;

/**
 * Visual tone: `default` for the standard light/dark header chrome, `inverse`
 * for the transparent-over-hero header where the nav sits on dark photography
 * (uses the `ink-contrast` on-dark tokens).
 */
export type HeaderAuthNavTone = 'default' | 'inverse';

export interface HeaderAuthNavProps {
  tone?: HeaderAuthNavTone;
  /** The surrounding shell owns the customer account link when false. */
  showCustomerNav?: boolean;
}

const linkClass =
  (tone: HeaderAuthNavTone) =>
  ({ isActive }: { isActive: boolean }) =>
    cn(
      'min-h-10 rounded-md px-3 py-2 text-sm no-underline',
      'outline-none focus-visible:outline focus-visible:outline-2',
      'focus-visible:outline-offset-2 focus-visible:outline-focus',
      isActive
        ? 'bg-primary font-bold text-primary-contrast'
        : tone === 'inverse'
          ? 'text-ink-contrast hover:bg-ink-contrast/10'
          : 'text-text hover:bg-elevated',
    );

/**
 * Role-aware account navigation rendered in the app shell header.
 *
 * - **Anonymous:** a single «ورود به حساب» link to the OTP login.
 * - **Customer:** customer-facing destinations (home / booking) plus sign-out.
 * - **Staff (Owner/Admin/Stylist):** the management destinations permitted for
 *   that role (reusing the same RBAC nav matrix as the owner panel) plus a role
 *   badge and sign-out.
 *
 * It reads the app-wide {@link useAuth} state, so it works on every route under
 * the app shell. Outside an `AuthProvider` (isolated tests) the context's
 * default anonymous value is used, so it renders the signed-out state safely.
 */
export function HeaderAuthNav({
  tone = 'default',
  showCustomerNav = true,
}: HeaderAuthNavProps = {}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { status, role, isStaff, isPlatformAdmin, signOut } = useAuth();
  const inverse = tone === 'inverse';

  // Avoid a signed-out → signed-in flash while the session is being restored.
  if (status === 'loading') {
    return null;
  }

  if (status === 'anonymous') {
    return (
      <Link
        to="/auth"
        data-testid="header-sign-in"
        aria-label={t('app.signIn')}
        className={cn(
          'inline-flex min-h-10 min-w-10 shrink-0 items-center gap-2 rounded-md !px-2 py-2 text-sm font-semibold no-underline sm:!px-3',
          inverse ? 'text-ink-contrast hover:bg-ink-contrast/10' : 'text-text hover:bg-elevated',
          'outline-none focus-visible:outline focus-visible:outline-2',
          'focus-visible:outline-offset-2 focus-visible:outline-focus',
        )}
      >
        <LogIn className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
        <span className="hidden sm:inline">{t('app.signIn')}</span>
      </Link>
    );
  }

  const items: HeaderNavItem[] = isPlatformAdmin
    ? [{ labelKey: 'platform.nav.dashboard', to: '/platform-admin', end: true }]
    : isStaff && role
      ? STAFF_NAV.filter((item) => item.roles.some((allowedRole) => allowedRole === role)).map(
          ({ labelKey, to }) => ({
            labelKey,
            to,
          }),
        )
      : showCustomerNav
        ? [...CUSTOMER_NAV]
        : [];

  const roleLabel = t(`app.role.${role ?? 'Customer'}`);

  const handleSignOut = () => {
    signOut();
    navigate('/');
  };

  return (
    <nav
      aria-label={t('app.account')}
      data-testid="header-account-nav"
      className="flex items-center gap-1"
    >
      <ul className="hidden items-center gap-1 md:flex">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} end={item.end} className={linkClass(tone)}>
              {t(item.labelKey)}
            </NavLink>
          </li>
        ))}
      </ul>

      <span
        data-testid="header-role-badge"
        className={cn(
          'hidden rounded-pill border px-2 py-1 text-2xs sm:inline-flex',
          inverse ? 'border-ink-border text-ink-muted' : 'border-border text-muted',
        )}
      >
        {roleLabel}
      </span>

      <Button
        variant="ghost"
        size="md"
        startIcon={<LogOut className="h-4 w-4 rtl:-scale-x-100" />}
        onClick={handleSignOut}
        data-testid="header-sign-out"
        aria-label={t('app.signOut')}
        className={cn(
          'shrink-0 !px-2 sm:!px-5',
          inverse && 'text-ink-contrast hover:bg-ink-contrast/10',
        )}
      >
        <span className="hidden sm:inline">{t('app.signOut')}</span>
      </Button>
    </nav>
  );
}

export default HeaderAuthNav;
