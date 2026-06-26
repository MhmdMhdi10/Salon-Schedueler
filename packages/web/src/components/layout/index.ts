/**
 * Layout module barrel: the application shells.
 *
 *  - `AppShell` — the base public/app shell (header / single `<main>` / footer,
 *    skip-to-content link, RTL-first responsive layout).
 *  - `FunnelShell` — the minimal customer booking-funnel shell (top bar +
 *    stepper + centered card + sticky bottom CTA, safe-area aware).
 *  - `AdminShell` — the admin tool shell (desktop side nav + breadcrumbs,
 *    mobile bottom tab bar), distinct from the customer flow (R3.6).
 *
 * See `.kiro/steering/ui-ux-skills.md` §5 (layout), §8 (navigation), §10
 * (accessibility) and R3.1 / R3.2 / R3.6 / R3.8.
 */
export { AppShell, MAIN_CONTENT_ID } from './AppShell';
export type { AppShellProps } from './AppShell';

export {
  FunnelShell,
  FUNNEL_CONTENT_ID,
  FUNNEL_STEPS,
} from './FunnelShell';
export type { FunnelShellProps, FunnelStep } from './FunnelShell';

export { AdminShell, ADMIN_CONTENT_ID } from './AdminShell';
export type { AdminShellProps, AdminBreadcrumb } from './AdminShell';

export {
  OwnerShell,
  OWNER_CONTENT_ID,
  OWNER_NAV,
  ownerNavForRole,
} from './OwnerShell';
export type { OwnerShellProps, OwnerNavItem } from './OwnerShell';

export { RouteLoader, ROUTE_LOADER_TESTID } from './RouteLoader';
export type { RouteLoaderProps } from './RouteLoader';
