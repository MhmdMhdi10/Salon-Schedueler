import {
  Calendar,
  ContactRound,
  BarChart3,
  Bell,
  Settings,
  CreditCard,
  QrCode,
  Receipt,
  Share2,
  UserRound,
  UsersRound,
  Megaphone,
  type LucideIcon,
} from 'lucide-react';
import type { OwnerRole } from '../../api/client';

/** A single owner-panel navigation destination. */
export interface OwnerNavItem {
  /** i18n key under `owner.nav.*` for the visible label. */
  labelKey: string;
  to: string;
  icon: LucideIcon;
  /** Roles allowed to see this destination. */
  roles: readonly OwnerRole[];
}

/**
 * The **single source of truth** for owner-panel destinations (R2.4, R2.6,
 * R2.7, R2.8). The desktop sidebar, the mobile bottom tab bar (primary tabs +
 * the profile screen), and any future nav surface all consume this one
 * list via {@link ownerNavForRole} — three separately hardcoded lists
 * previously disagreed (config shown to Admins who are route-guarded out,
 * my-qr unreachable from desktop, transactions/notifications stranded on
 * mobile).
 *
 * Role rules mirror the route guards in `pages/owner/index.tsx`: Owner sees
 * everything; Admin everything except configuration; Stylist sees their
 * calendar, client book, notifications, and personal QR.
 */
export const OWNER_NAV: readonly OwnerNavItem[] = [
  {
    labelKey: 'owner.nav.calendar',
    to: '/owner/calendar',
    icon: Calendar,
    roles: ['Owner', 'Admin', 'Stylist'],
  },
  {
    // Team management is Owner-only, like the configuration route it uses.
    labelKey: 'owner.nav.team',
    to: '/owner/team',
    icon: UsersRound,
    roles: ['Owner'],
  },
  {
    labelKey: 'owner.nav.clients',
    to: '/owner/clients',
    icon: ContactRound,
    roles: ['Owner', 'Admin', 'Stylist'],
  },
  {
    labelKey: 'owner.nav.marketing',
    to: '/owner/marketing',
    icon: Megaphone,
    roles: ['Owner', 'Admin'],
  },
  {
    labelKey: 'owner.nav.analytics',
    to: '/owner/analytics',
    icon: BarChart3,
    roles: ['Owner', 'Admin'],
  },
  {
    labelKey: 'owner.nav.qr',
    to: '/owner/qr',
    icon: QrCode,
    roles: ['Owner', 'Admin'],
  },
  {
    // Owner-only: matches the OwnerRoleGuard on the /owner/config route — an
    // Admin must not see a nav item that silently bounces back to the calendar.
    labelKey: 'owner.nav.configuration',
    to: '/owner/config',
    icon: Settings,
    roles: ['Owner'],
  },
  {
    labelKey: 'owner.nav.transactions',
    to: '/owner/transactions',
    icon: Receipt,
    roles: ['Owner', 'Admin'],
  },
  {
    labelKey: 'owner.nav.notifications',
    to: '/owner/notifications',
    icon: Bell,
    roles: ['Owner', 'Admin', 'Stylist'],
  },
  {
    labelKey: 'owner.nav.subscription',
    to: '/owner/subscription',
    icon: CreditCard,
    roles: ['Owner', 'Admin'],
  },
  {
    labelKey: 'owner.nav.myQr',
    to: '/owner/my-qr',
    icon: Share2,
    roles: ['Owner', 'Admin', 'Stylist'],
  },
  {
    labelKey: 'owner.nav.profile',
    to: '/owner/profile',
    icon: UserRound,
    roles: ['Owner', 'Admin', 'Stylist'],
  },
] as const;

/** Returns the nav destinations a given role may see. */
export function ownerNavForRole(role: OwnerRole): OwnerNavItem[] {
  return OWNER_NAV.filter((item) => item.roles.includes(role));
}
