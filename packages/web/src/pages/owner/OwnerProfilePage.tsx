import { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Building2,
  ChevronLeft,
  CircleUserRound,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import { adminApi, qrApi, type OwnerRole } from '../../api/client';
import { Avatar } from '../../components/ui/Avatar';
import { cn } from '../../components/ui/cn';
import { toPersianDigits } from '../../components/ui';
import { ownerNavForRole, type OwnerNavItem } from '../../components/owner/ownerNav';
import { useOwnerContext } from './index';

import './owner-profile.css';

type ProfileSectionKey = 'operations' | 'business' | 'communication';

interface ProfileSectionDefinition {
  key: ProfileSectionKey;
  titleKey: string;
  hintKey: string;
  routes: readonly string[];
}

const PROFILE_SECTIONS: readonly ProfileSectionDefinition[] = [
  {
    key: 'operations',
    titleKey: 'owner.profile.sections.operations',
    hintKey: 'owner.profile.sections.operationsHint',
    routes: ['/owner/team', '/owner/config', '/owner/qr', '/owner/my-qr'],
  },
  {
    key: 'business',
    titleKey: 'owner.profile.sections.business',
    hintKey: 'owner.profile.sections.businessHint',
    routes: ['/owner/analytics', '/owner/transactions', '/owner/subscription'],
  },
  {
    key: 'communication',
    titleKey: 'owner.profile.sections.communication',
    hintKey: 'owner.profile.sections.communicationHint',
    routes: ['/owner/marketing', '/owner/notifications'],
  },
];

const PROFILE_ITEM_HINTS: Record<string, string> = {
  '/owner/team': 'owner.profile.itemHints.team',
  '/owner/config': 'owner.profile.itemHints.configuration',
  '/owner/qr': 'owner.profile.itemHints.qr',
  '/owner/my-qr': 'owner.profile.itemHints.myQr',
  '/owner/analytics': 'owner.profile.itemHints.analytics',
  '/owner/transactions': 'owner.profile.itemHints.transactions',
  '/owner/subscription': 'owner.profile.itemHints.subscription',
  '/owner/marketing': 'owner.profile.itemHints.marketing',
  '/owner/notifications': 'owner.profile.itemHints.notifications',
};

const ACCESS_LEVEL_KEYS: Record<OwnerRole, string> = {
  Owner: 'owner.profile.accessLevels.owner',
  Admin: 'owner.profile.accessLevels.admin',
  Stylist: 'owner.profile.accessLevels.stylist',
};

interface ProfileIdentity {
  staffName: string;
  salonName: string;
  phone: string;
  active: boolean;
}

function profileItemLabel(t: (key: string) => string, item: OwnerNavItem): string {
  return t(item.labelKey);
}

function ProfileLink({
  item,
  hintKey,
  t,
}: {
  item: OwnerNavItem;
  hintKey: string;
  t: (key: string) => string;
}) {
  const Icon = item.icon;
  return (
    <li>
      <NavLink
        to={item.to}
        className={cn(
          'owner-profile-tool group flex min-h-[68px] items-center gap-3 rounded-xl border px-3 py-3',
          'no-underline outline-none transition-colors',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        )}
      >
        <span className="owner-profile-tool__icon inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-text">
            {profileItemLabel(t, item)}
          </span>
          <span className="mt-1 block truncate text-xs text-muted">{t(hintKey)}</span>
        </span>
        {/* RTL-native: this trailing chevron points toward the next profile surface. */}
        <ChevronLeft
          className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:-translate-x-0.5"
          aria-hidden="true"
        />
      </NavLink>
    </li>
  );
}

export function OwnerProfilePage() {
  const { t } = useTranslation();
  const { role, salonId, staffMemberId, onSignOut } = useOwnerContext();
  const [identity, setIdentity] = useState<ProfileIdentity>({
    staffName: '',
    salonName: '',
    phone: '',
    active: true,
  });
  const [identityLoading, setIdentityLoading] = useState(Boolean(salonId));

  useEffect(() => {
    if (!salonId) {
      setIdentityLoading(false);
      return;
    }

    let active = true;
    setIdentityLoading(true);

    Promise.all([
      adminApi
        .getStaff(salonId)
        .then((response) => {
          const current =
            response.staff.find((member) => member.id === staffMemberId) ??
            response.staff.find((member) => member.role === role);
          return {
            staffName: current?.fullName?.trim() ?? '',
            phone: current?.phone?.trim() ?? '',
            active: current?.active ?? true,
          };
        })
        .catch(() => ({ staffName: '', phone: '', active: true })),
      qrApi
        .getSalonQr(salonId)
        .then((response) => response.salonName?.trim() ?? '')
        .catch(() => ''),
    ]).then(([staffName, salonName]) => {
      if (!active) return;
      setIdentity({ ...staffName, salonName });
      setIdentityLoading(false);
    });

    return () => {
      active = false;
    };
  }, [role, salonId, staffMemberId]);

  const visibleItems = useMemo(() => ownerNavForRole(role), [role]);
  const accountName = identity.staffName || t('owner.profile.defaultName');
  const salonName = identity.salonName || t('owner.profile.salonFallback');
  const roleLabel = t('app.role.' + role, { defaultValue: role });
  const accessLabel = t(ACCESS_LEVEL_KEYS[role]);

  const sections = PROFILE_SECTIONS.map((section) => ({
    ...section,
    items: visibleItems.filter((item) => section.routes.includes(item.to)),
  })).filter((section) => section.items.length > 0);

  return (
    <section
      className="owner-profile-page mx-auto w-full max-w-3xl"
      data-testid="owner-profile-page"
      aria-busy={identityLoading}
    >
      <header className="owner-profile-page__intro mb-5">
        <p className="owner-profile-page__eyebrow">{t('owner.profile.eyebrow')}</p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold tracking-tight text-text">
              {t('owner.profile.pageTitle')}
            </h1>
            <p className="mt-1 max-w-xl text-sm leading-6 text-muted">
              {t('owner.profile.pageDescription')}
            </p>
          </div>
        </div>
      </header>

      <section
        className="owner-profile-identity mb-6 overflow-hidden rounded-2xl border"
        aria-labelledby="owner-profile-identity-title"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
          <div className="flex min-w-0 items-center gap-4">
            <div className="owner-profile-avatar-frame relative shrink-0 rounded-full">
              <Avatar
                name={accountName}
                size="lg"
                decorative
                className="!h-16 !w-16 !border-0 !bg-primary/10 !text-lg !text-primary"
              />
              <span
                className={cn(
                  'owner-profile-status-dot',
                  !identity.active && 'owner-profile-status-dot--inactive',
                )}
                aria-hidden="true"
              />
            </div>
            <div className="min-w-0">
              <p className="owner-profile-card-label">{t('owner.profile.accountLabel')}</p>
              <h2 id="owner-profile-identity-title" className="mt-1 truncate text-lg font-extrabold text-text">
                {accountName}
              </h2>
              <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-muted">
                <Building2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{salonName}</span>
              </p>
            </div>
          </div>
          <span
            className={cn(
              'owner-profile-account-badge inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-bold',
              !identity.active && 'owner-profile-account-badge--inactive',
            )}
          >
            <CircleUserRound className="h-4 w-4" aria-hidden="true" />
            {identity.active
              ? t('owner.profile.accountBadge')
              : t('owner.profile.accountInactiveBadge')}
          </span>
        </div>
        <div className="owner-profile-meta grid grid-cols-2 border-t">
          <div className="px-4 py-3 sm:px-5">
            <p className="owner-profile-card-label">{t('owner.profile.roleLabel')}</p>
            <p className="mt-1 text-sm font-bold text-text">{roleLabel}</p>
          </div>
          <div className="border-s px-4 py-3 sm:px-5">
            <p className="owner-profile-card-label">{t('owner.profile.accessLabel')}</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-text">
              <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
              {accessLabel}
            </p>
          </div>
        </div>
      </section>

      <section
        className="owner-profile-account-details mb-6 overflow-hidden rounded-2xl border"
        aria-labelledby="owner-profile-account-details-title"
      >
        <div className="border-b px-4 py-3 sm:px-5">
          <h2
            id="owner-profile-account-details-title"
            className="text-base font-extrabold text-text"
          >
            {t('owner.profile.accountDetailsTitle')}
          </h2>
          <p className="mt-1 text-xs text-muted">{t('owner.profile.accountDetailsHint')}</p>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2">
          <div className="px-4 py-3 sm:px-5">
            <dt className="owner-profile-card-label">{t('owner.profile.loginPhoneLabel')}</dt>
            <dd className="mt-1 text-sm font-bold text-text" dir="ltr">
              {identity.phone
                ? toPersianDigits(identity.phone)
                : t('owner.profile.phoneFallback')}
            </dd>
          </div>
          <div className="border-t px-4 py-3 sm:border-s sm:border-t-0 sm:px-5">
            <dt className="owner-profile-card-label">{t('owner.profile.statusLabel')}</dt>
            <dd className="mt-1 text-sm font-bold text-text">
              {identity.active
                ? t('owner.profile.statusActive')
                : t('owner.profile.statusInactive')}
            </dd>
          </div>
        </dl>
      </section>

      <div className="space-y-5">
        {sections.map((section) => (
          <section key={section.key} aria-labelledby={'owner-profile-section-' + section.key}>
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h2
                  id={'owner-profile-section-' + section.key}
                  className="text-base font-extrabold text-text"
                >
                  {t(section.titleKey)}
                </h2>
                <p className="mt-1 text-xs text-muted">{t(section.hintKey)}</p>
              </div>
              <span className="owner-profile-section-count">{section.items.length}</span>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2" role="list">
              {section.items.map((item) => (
                <ProfileLink
                  key={item.to}
                  item={item}
                  hintKey={PROFILE_ITEM_HINTS[item.to] ?? 'owner.profile.itemFallback'}
                  t={t}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      {onSignOut && (
        <div className="mt-7 border-t border-border pt-4">
          <button
            type="button"
            data-testid="owner-profile-sign-out"
            onClick={onSignOut}
            className="owner-profile-sign-out flex min-h-12 w-full items-center gap-3 rounded-xl px-4 py-3 text-start outline-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <LogOut className="h-5 w-5 shrink-0 rtl:-scale-x-100" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold">{t('owner.signOut')}</span>
              <span className="mt-1 block text-xs opacity-75">{t('owner.profile.signOutHint')}</span>
            </span>
            {/* RTL-native: this trailing chevron points toward the sign-out action. */}
            <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
          </button>
        </div>
      )}
    </section>
  );
}

export default OwnerProfilePage;
