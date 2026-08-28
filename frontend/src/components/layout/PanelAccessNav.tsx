import { Building2, ShieldCheck, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { cn } from '../ui/cn';

export type PanelAccessNavTone = 'app' | 'platform';

export interface PanelAccessNavProps {
  tone?: PanelAccessNavTone;
  className?: string;
}

const PANEL_LINKS = [
  { key: 'salon', to: '/owner', labelKey: 'app.workspace.salonPanel', Icon: Building2 },
  { key: 'user', to: '/account', labelKey: 'app.workspace.userPanel', Icon: UserRound },
  { key: 'admin', to: '/platform-admin', labelKey: 'app.workspace.adminPanel', Icon: ShieldCheck },
] as const;

/** Direct access to every application panel for a platform administrator. */
export function PanelAccessNav({ tone = 'app', className }: PanelAccessNavProps) {
  const { t } = useTranslation();

  return (
    <nav
      aria-label={t('app.workspace.navigation')}
      data-testid="panel-access-nav"
      className={cn(
        tone === 'platform' ? 'platform-admin-panel-nav' : 'flex shrink-0 items-center gap-1',
        className,
      )}
    >
      {PANEL_LINKS.map(({ key, to, labelKey, Icon }) => {
        const label = t(labelKey);
        return (
          <NavLink
            key={key}
            to={to}
            title={label}
            aria-label={label}
            className={({ isActive }) =>
              cn(
                tone === 'platform'
                  ? 'platform-admin-panel-nav__link'
                  : [
                      'inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md border px-3 py-2',
                      'border-border bg-surface text-xs font-semibold text-text no-underline sm:text-sm',
                      'transition-colors duration-fast ease-standard hover:bg-elevated',
                      'outline-none focus-visible:outline focus-visible:outline-2',
                      'focus-visible:outline-offset-2 focus-visible:outline-focus',
                    ],
                isActive &&
                  (tone === 'platform'
                    ? 'platform-admin-panel-nav__link--active'
                    : 'border-primary/40 bg-primary/10 text-primary'),
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

export default PanelAccessNav;
