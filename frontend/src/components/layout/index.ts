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

export { FunnelShell, FUNNEL_CONTENT_ID, FUNNEL_STEPS } from './FunnelShell';
export type { FunnelShellProps, FunnelStep } from './FunnelShell';

export { AdminShell, ADMIN_CONTENT_ID } from './AdminShell';
export type { AdminShellProps, AdminBreadcrumb } from './AdminShell';

export {
  OwnerShell,
  OWNER_CONTENT_ID,
  OWNER_NAV,
  OWNER_THEME_STORAGE_KEY,
  ownerNavForRole,
} from './OwnerShell';
export type { OwnerShellProps, OwnerNavItem } from './OwnerShell';

export { OwnerBottomTabs } from './OwnerBottomTabs';
export type { OwnerBottomTabsProps } from './OwnerBottomTabs';

export { RouteLoader, ROUTE_LOADER_TESTID } from './RouteLoader';
export type { RouteLoaderProps } from './RouteLoader';
export { RouteProgress } from './RouteProgress';

export { PanelAccessNav } from './PanelAccessNav';
export type { PanelAccessNavProps, PanelAccessNavTone } from './PanelAccessNav';

export { WorkspaceSwitcher } from './WorkspaceSwitcher';
export type {
  WorkspaceSwitcherProps,
  WorkspaceSwitcherVariant,
  WorkspaceSurface,
} from './WorkspaceSwitcher';

export { PanelHeader } from './PanelHeader';
export type { PanelHeaderProps, PanelHeaderSurface } from './PanelHeader';

export { PanelOnboardingGuide, useFirstVisitPanelGuide } from './PanelOnboardingGuide';
export type { PanelGuideStep } from './PanelOnboardingGuide';

/**
 * Editorial layout primitives (design §3; R1.4, R2.2, R3.4) — thin CSS-grid
 * wrappers (logical properties + tokens only) that let surfaces escape the
 * generic "stacked equal cards" look:
 *
 *  - `EditorialSplit` — asymmetric 2-column hero/feature row (collapses on md).
 *  - `FeatureMosaic` — uneven lead + supporting tiles for 3+ peer features.
 *  - `SectionRhythm` — alternates section background + vertical density.
 */
export { EditorialSplit } from './EditorialSplit';
export type { EditorialSplitProps } from './EditorialSplit';

export { FeatureMosaic } from './FeatureMosaic';
export type { FeatureMosaicProps } from './FeatureMosaic';

export { SectionRhythm } from './SectionRhythm';
export type { SectionRhythmProps } from './SectionRhythm';
