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
  Scissors,
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
  /** Stable target id used by the first-entry panel walkthrough. */
  guideId: string;
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
 * Role rules mirror the route guards in `pages/owner/index.tsx`: Owner/Admin
 * see everything; Stylist sees their calendar, client book, notifications, and
 * personal QR.
 */
export const OWNER_NAV: readonly OwnerNavItem[] = [
  {
    labelKey: 'owner.nav.calendar',
    to: '/owner/calendar',
    icon: Calendar,
    guideId: 'owner-calendar',
    roles: ['Owner', 'Admin', 'Stylist'],
  },
  {
    // Team management is available to every salon manager.
    labelKey: 'owner.nav.team',
    to: '/owner/team',
    icon: UsersRound,
    guideId: 'owner-team',
    roles: ['Owner', 'Admin'],
  },
  {
    labelKey: 'owner.nav.clients',
    to: '/owner/clients',
    icon: ContactRound,
    guideId: 'owner-clients',
    roles: ['Owner', 'Admin', 'Stylist'],
  },
  {
    labelKey: 'owner.nav.marketing',
    to: '/owner/marketing',
    icon: Megaphone,
    guideId: 'owner-marketing',
    roles: ['Owner', 'Admin'],
  },
  {
    labelKey: 'owner.nav.analytics',
    to: '/owner/analytics',
    icon: BarChart3,
    guideId: 'owner-analytics',
    roles: ['Owner', 'Admin'],
  },
  {
    labelKey: 'owner.nav.qr',
    to: '/owner/qr',
    icon: QrCode,
    guideId: 'owner-qr',
    roles: ['Owner', 'Admin'],
  },
  {
    // Salon managers can configure the salon and manage staff.
    labelKey: 'owner.nav.configuration',
    to: '/owner/config',
    icon: Settings,
    guideId: 'owner-configuration',
    roles: ['Owner', 'Admin'],
  },
  {
    labelKey: 'owner.nav.services',
    to: '/owner/services',
    icon: Scissors,
    guideId: 'owner-services',
    roles: ['Owner', 'Admin'],
  },
  {
    labelKey: 'owner.nav.transactions',
    to: '/owner/transactions',
    icon: Receipt,
    guideId: 'owner-transactions',
    roles: ['Owner', 'Admin'],
  },
  {
    labelKey: 'owner.nav.notifications',
    to: '/owner/notifications',
    icon: Bell,
    guideId: 'owner-notifications',
    roles: ['Owner', 'Admin', 'Stylist'],
  },
  {
    labelKey: 'owner.nav.subscription',
    to: '/owner/subscription',
    icon: CreditCard,
    guideId: 'owner-subscription',
    roles: ['Owner', 'Admin'],
  },
  {
    labelKey: 'owner.nav.myQr',
    to: '/owner/my-qr',
    icon: Share2,
    guideId: 'owner-my-qr',
    roles: ['Owner', 'Admin', 'Stylist'],
  },
  {
    labelKey: 'owner.nav.profile',
    to: '/owner/profile',
    icon: UserRound,
    guideId: 'owner-profile',
    roles: ['Owner', 'Admin', 'Stylist'],
  },
] as const;

/** Returns the nav destinations a given role may see. */
export function ownerNavForRole(role: OwnerRole): OwnerNavItem[] {
  return OWNER_NAV.filter((item) => item.roles.includes(role));
}
