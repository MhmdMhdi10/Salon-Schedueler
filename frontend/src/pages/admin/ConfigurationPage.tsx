import { useCallback, useEffect, useMemo, useState, FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Armchair,
  CalendarOff,
  Clock,
  Palette,
  Plus,
  Scissors,
  ShieldCheck,
  Trash2,
  Users,
  type LucideIcon,
} from 'lucide-react';
import {
  adminApi,
  approvalPolicyApi,
  brandAccentApi,
  holidaysApi,
  salonApi,
  staffApi,
  staffAvailabilityApi,
  ApiError,
  type ApprovalPolicyStaff,
  type SalonClosure,
  type SalonStaff,
  type StaffRole,
  type StaffUpdateInput,
} from '../../api/client';
import { useSalonId } from '../../auth/useSalonId';
import { SeoHead } from '../../components/seo';
import { TenantTheme } from '../../components/theme';
import { ACCENTS } from '../owner/marketing-assets';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  EmptyState,
  ErrorState,
  IconButton,
  JalaliDate,
  JalaliDatePicker,
  Money,
  Select,
  Skeleton,
  Spinner,
  Switch,
  TextField,
  cn,
  useToast,
} from '../../components/ui';

/**
 * Admin configuration screen at `/admin/config` (R5.1, R5.4, R5.5, R2.3; ui-ux
 * Admin Configuration recipe, §1 forgiveness/undo, §6 states, §8
 * navigation/breadcrumbs).
 *
 * The redesign turns the bare lists into a sectioned, scannable tool:
 *
 *  - **Sectioned cards** — Staff / Chairs / Services / Holidays, each a `Card`
 *    with a scannable list and an **inline add form** (composed from `TextField`
 *    + `Button`). Holidays sit behind a «تنظیمات پیشرفته» disclosure
 *    (progressive disclosure, ui-ux §1).
 *  - **Wayfinding** — an admin **breadcrumb** trail (خانه ‹ تنظیمات) plus an
 *    in-page **anchor nav** jumping to each section (ui-ux §8).
 *  - **Data states** — page-level loading (skeleton sections), per-section
 *    empty-states with a create CTA, and an error state with retry (ui-ux §6,
 *    R2.3).
 *  - **Forgiveness & undo** — destructive actions confirm in a `Dialog` and,
 *    once removed, offer an **undo** toast («بازگردانی») that restores the item
 *    at its original position (ui-ux §1, R5.4 owner safety).
 *  - **Services list** shows name · duration · **Rial price** with tabular
 *    numerals via `<Money>` (R7.5).
 *
 * The staff/chairs/services lists are fetched live from the API client
 * (`adminApi.getStaff`, `adminApi.getChairs`, `salonApi.getServices`); the wire
 * contracts are unchanged. Holidays are managed client-side because the API
 * client exposes no holidays endpoint, and the "add" actions for the
 * server-backed resources append optimistically (the client has no create
 * endpoint) — the read/list views are real and wired.
 *
 * Preserved test hooks (kept green): the `admin-configuration` root testID, the
 * `config-loading` / `config-error` state testIDs, and the
 * `staff-list` / `chairs-list` / `services-list` / `holidays-list` list testIDs.
 *
 * An admin route is private and must never be indexed; `<SeoHead>` (noindex
 * default) emits `noindex,follow` (seo §1, R8.7).
 */

type LoadStatus = 'loading' | 'success' | 'error';

interface ServiceItem {
  id: string;
  name: string;
  durationMinutes: number;
  priceRial: number;
}

/** A simple labelled entry used by the staff/chairs/holidays sections. */
interface Entry {
  id: string;
  label: string;
}

/** Best-effort human label for an opaque resource record from the API. */
function itemLabel(item: unknown): string {
  if (item && typeof item === 'object') {
    const rec = item as Record<string, unknown>;
    if (typeof rec.name === 'string') return rec.name;
    if (typeof rec.fullName === 'string') return rec.fullName;
    if (typeof rec.label === 'string') return rec.label;
    if (typeof rec.id === 'string') return rec.id;
  }
  return String(item);
}

/** Map an opaque API record to a labelled entry, keeping a stable id. */
function toEntry(item: unknown, fallbackId: string): Entry {
  const label = itemLabel(item);
  if (item && typeof item === 'object') {
    const rec = item as Record<string, unknown>;
    if (typeof rec.id === 'string') return { id: rec.id, label };
  }
  return { id: fallbackId, label };
}

/** The in-page anchor-nav destinations (also the section ids). */
const SECTION_IDS = {
  approval: 'approval',
  brand: 'brand',
  staff: 'staff',
  chairs: 'chairs',
  services: 'services',
  holidays: 'holidays',
} as const;

interface SectionShellProps {
  id: string;
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}

/** A titled section card with a leading icon, used by every config section. */
function SectionShell({ id, icon: Icon, title, children }: SectionShellProps) {
  return (
    <Card as="section" id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24">
      <CardHeader>
        <CardTitle as="h2" id={`${id}-title`} className="flex items-center gap-2">
          <Icon className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

interface DeleteState {
  id: string;
  label: string;
  /** The handler that performs the removal + undo toast. */
  onConfirm: () => void;
}

/**
 * Generic list section (staff / chairs / holidays): a labelled list with an
 * inline add form, per-item delete (confirm + undo), and an empty state.
 */
interface EntrySectionProps {
  id: string;
  listTestId: string;
  icon: LucideIcon;
  title: string;
  entries: Entry[];
  onAdd: (label: string) => void;
  onRemove: (id: string) => void;
  onRestore: (entry: Entry, index: number) => void;
  addLabel: string;
  addPlaceholder: string;
  addCta: string;
  emptyTitle: string;
  emptyBody: string;
  /** Called to request the shared confirm dialog. */
  requestDelete: (state: DeleteState) => void;
}

function EntrySection({
  id,
  listTestId,
  icon: Icon,
  title,
  entries,
  onAdd,
  onRemove,
  onRestore,
  addLabel,
  addPlaceholder,
  addCta,
  emptyTitle,
  emptyBody,
  requestDelete,
}: EntrySectionProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) {
      onAdd(trimmed);
      setValue('');
    }
  };

  const handleDelete = (entry: Entry) => {
    const index = entries.findIndex((item) => item.id === entry.id);
    requestDelete({
      id: entry.id,
      label: entry.label,
      onConfirm: () => {
        onRemove(entry.id);
        onRestore(entry, index);
      },
    });
  };

  return (
    <SectionShell id={id} icon={Icon} title={title}>
      {entries.length === 0 ? (
        // The list stays in the DOM (with its testID) even when empty so the
        // empty-state and the existing test hook can coexist.
        <ul data-testid={listTestId} className="sr-only" aria-hidden="true" />
      ) : (
        <ul data-testid={listTestId} className="flex flex-col divide-y divide-border">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0 break-words text-sm text-text">{entry.label}</span>
              <IconButton
                variant="danger"
                aria-label={t('admin.config.removeItem', { name: entry.label })}
                onClick={() => handleDelete(entry)}
                className="h-9 min-h-0 w-9 min-w-0 shrink-0"
              >
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      {entries.length === 0 && (
        <EmptyState
          icon={<Icon className="h-8 w-8" />}
          title={emptyTitle}
          description={emptyBody}
        />
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <TextField
          label={addLabel}
          placeholder={addPlaceholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          containerClassName="sm:flex-1"
        />
        <Button type="submit" startIcon={<Plus className="h-4 w-4" />} className="shrink-0">
          {addCta}
        </Button>
      </form>
    </SectionShell>
  );
}

/**
 * Services section: a structured list (name · duration · Rial price with
 * tabular numerals) plus a richer inline add form (name + duration + price).
 */
interface ServicesSectionProps {
  services: ServiceItem[];
  onAdd: (service: { name: string; durationMinutes: number; priceRial: number }) => void;
  onRemove: (id: string) => void;
  onRestore: (service: ServiceItem, index: number) => void;
  requestDelete: (state: DeleteState) => void;
}

function ServicesSection({
  services,
  onAdd,
  onRemove,
  onRestore,
  requestDelete,
}: ServicesSectionProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [duration, setDuration] = useState('');
  const [price, setPrice] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd({
      name: trimmed,
      durationMinutes: Number.parseInt(duration, 10) || 0,
      priceRial: Number.parseInt(price, 10) || 0,
    });
    setName('');
    setDuration('');
    setPrice('');
  };

  const handleDelete = (service: ServiceItem) => {
    const index = services.findIndex((item) => item.id === service.id);
    requestDelete({
      id: service.id,
      label: service.name,
      onConfirm: () => {
        onRemove(service.id);
        onRestore(service, index);
      },
    });
  };

  return (
    <SectionShell id={SECTION_IDS.services} icon={Scissors} title={t('admin.services')}>
      {services.length === 0 ? (
        <ul data-testid="services-list" className="sr-only" aria-hidden="true" />
      ) : (
        <ul data-testid="services-list" className="flex flex-col divide-y divide-border">
          {services.map((service) => (
            <li key={service.id} className="flex items-center justify-between gap-3 py-2">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="break-words text-sm font-medium text-text">{service.name}</span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('booking.durationMinutes', { count: service.durationMinutes })}
                  </span>
                  <Money amountRial={service.priceRial} className="font-medium text-text" />
                </span>
              </div>
              <IconButton
                variant="danger"
                aria-label={t('admin.config.removeItem', { name: service.name })}
                onClick={() => handleDelete(service)}
                className="h-9 min-h-0 w-9 min-w-0 shrink-0"
              >
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      {services.length === 0 && (
        <EmptyState
          icon={<Scissors className="h-8 w-8" />}
          title={t('admin.config.services.emptyTitle')}
          description={t('admin.config.services.emptyBody')}
        />
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <TextField
          label={t('admin.config.services.nameLabel')}
          placeholder={t('admin.config.services.namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="flex flex-col gap-3 sm:flex-row">
          <TextField
            label={t('admin.config.services.durationLabel')}
            placeholder={t('admin.config.services.durationPlaceholder')}
            inputMode="numeric"
            dir="ltr"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            containerClassName="sm:flex-1"
          />
          <TextField
            label={t('admin.config.services.priceLabel')}
            placeholder={t('admin.config.services.pricePlaceholder')}
            inputMode="numeric"
            dir="ltr"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            containerClassName="sm:flex-1"
          />
        </div>
        <Button type="submit" startIcon={<Plus className="h-4 w-4" />} className="self-start">
          {t('admin.config.services.addCta')}
        </Button>
      </form>
    </SectionShell>
  );
}

/** Tri-state approval choice for a single stylist (maps to `boolean | null`). */
type StaffPolicyValue = 'inherit' | 'auto' | 'manual';

/** `null` (inherit) | `true` (auto) | `false` (manual) → the Select's value. */
function toStaffValue(autoApprove: boolean | null): StaffPolicyValue {
  if (autoApprove === null || autoApprove === undefined) return 'inherit';
  return autoApprove ? 'auto' : 'manual';
}

/** The Select's value → the API payload (`null` = inherit the salon default). */
function fromStaffValue(value: StaffPolicyValue): boolean | null {
  if (value === 'inherit') return null;
  return value === 'auto';
}

type PolicyStatus = 'loading' | 'success' | 'error';

/**
 * Approval-policy section: the salon-level default (auto-confirm vs manual
 * approval) plus an optional per-stylist override. Wired to the owner endpoints
 * (`GET /salons/:id/approval-policy`, `POST .../auto-approve`,
 * `POST /staff/:id/auto-approve`). Edits are optimistic and reconciled — a
 * failed save rolls back and surfaces an error toast (ui-ux §12, §6); a success
 * confirms with a polite toast.
 *
 * This is a self-contained data surface with its own loading / error+retry /
 * success states (ui-ux §6) so it never blocks the rest of the configuration
 * page, which loads independently.
 */
function ApprovalPolicySection({ salonId }: { salonId: string }) {
  const { t } = useTranslation();
  const { success, error: toastError } = useToast();

  const [status, setStatus] = useState<PolicyStatus>('loading');
  const [salonAuto, setSalonAuto] = useState(false);
  const [staff, setStaff] = useState<ApprovalPolicyStaff[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setStatus('loading');
    let active = true;
    approvalPolicyApi
      .get(salonId)
      .then((policy) => {
        if (!active) return;
        setSalonAuto(policy.autoApprove);
        setStaff(policy.staff);
        setStatus('success');
      })
      .catch(() => {
        if (active) setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [salonId]);

  useEffect(() => load(), [load]);

  const policyOptions = useMemo(
    () => [
      { value: 'inherit', label: t('admin.config.approval.inherit') },
      { value: 'auto', label: t('admin.config.approval.auto') },
      { value: 'manual', label: t('admin.config.approval.manual') },
    ],
    [t],
  );

  const handleSalonToggle = async (next: boolean) => {
    const prev = salonAuto;
    setSalonAuto(next); // optimistic
    setSaving(true);
    try {
      await approvalPolicyApi.setSalon(salonId, next);
      success({ title: t('admin.config.approval.saved') });
    } catch {
      setSalonAuto(prev); // reconcile/rollback
      toastError({ title: t('admin.config.approval.saveFailed') });
    } finally {
      setSaving(false);
    }
  };

  const handleStaffChange = async (staffId: string, value: StaffPolicyValue) => {
    const next = fromStaffValue(value);
    const prev = staff;
    setStaff((list) => list.map((s) => (s.id === staffId ? { ...s, autoApprove: next } : s)));
    setSaving(true);
    try {
      await approvalPolicyApi.setStaff(staffId, next);
      success({ title: t('admin.config.approval.saved') });
    } catch {
      setStaff(prev); // reconcile/rollback
      toastError({ title: t('admin.config.approval.saveFailed') });
    } finally {
      setSaving(false);
    }
  };

  // Grant/revoke a stylist's permission to manage their own availability (block
  // their own day/hours from the calendar). Optimistic with rollback (ui-ux §6).
  const handleStaffManageOwn = async (staffId: string, allowed: boolean) => {
    const prev = staff;
    setStaff((list) =>
      list.map((s) => (s.id === staffId ? { ...s, manageOwnAvailability: allowed } : s)),
    );
    setSaving(true);
    try {
      await staffAvailabilityApi.setManageOwn(staffId, allowed);
      success({ title: t('admin.config.approval.saved') });
    } catch {
      setStaff(prev); // reconcile/rollback
      toastError({ title: t('admin.config.approval.saveFailed') });
    } finally {
      setSaving(false);
    }
  };

  const handleStaffApproveOwn = async (staffId: string, allowed: boolean) => {
    const prev = staff;
    setStaff((list) =>
      list.map((s) => (s.id === staffId ? { ...s, canApproveOwnAppointments: allowed } : s)),
    );
    setSaving(true);
    try {
      await approvalPolicyApi.setStaffCanApproveOwn(staffId, allowed);
      success({ title: t('admin.config.approval.approveOwnSaved') });
    } catch {
      setStaff(prev);
      toastError({ title: t('admin.config.approval.approveOwnSaveFailed') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionShell
      id={SECTION_IDS.approval}
      icon={ShieldCheck}
      title={t('admin.config.approval.title')}
    >
      {status === 'loading' && (
        <div
          data-testid="approval-loading"
          role="status"
          aria-busy="true"
          aria-label={t('admin.config.approval.loadingLabel')}
          className="flex flex-col gap-3"
        >
          <Skeleton variant="rect" className="h-12" />
          <Skeleton variant="rect" className="h-10" />
        </div>
      )}

      {status === 'error' && (
        <ErrorState
          title={t('admin.config.approval.errorTitle')}
          retryLabel={t('admin.config.retry')}
          onRetry={load}
        />
      )}

      {status === 'success' && (
        <div data-testid="approval-policy" className="flex flex-col gap-5">
          <p className="max-w-[60ch] text-sm text-muted">{t('admin.config.approval.body')}</p>

          {/* Salon-level default. */}
          <div className="rounded-md border border-border bg-bg p-4">
            <Switch
              checked={salonAuto}
              onCheckedChange={handleSalonToggle}
              disabled={saving}
              label={t('admin.config.approval.salonToggleLabel')}
              helperText={t('admin.config.approval.salonToggleHelper')}
            />
          </div>

          {/* Per-stylist overrides. */}
          <div className="flex flex-col gap-3">
            <div>
              <h3 className="text-sm font-semibold text-text">
                {t('admin.config.approval.staffTitle')}
              </h3>
              <p className="mt-0.5 max-w-[60ch] text-xs text-muted">
                {t('admin.config.approval.staffBody')}
              </p>
            </div>

            {staff.length === 0 ? (
              <EmptyState
                icon={<Users className="h-8 w-8" />}
                title={t('admin.config.approval.staffEmptyTitle')}
                description={t('admin.config.approval.staffEmptyBody')}
              />
            ) : (
              <ul
                data-testid="approval-staff-list"
                className="flex flex-col divide-y divide-border"
              >
                {staff.map((member) => {
                  const value = toStaffValue(member.autoApprove);
                  const name = member.fullName ?? member.id;
                  return (
                    <li
                      key={member.id}
                      className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="break-words text-sm font-medium text-text">{name}</span>
                        <span className="text-xs text-muted">{t(`app.role.${member.role}`)}</span>
                      </div>
                      <div className="flex w-full flex-col gap-2 sm:w-56 sm:shrink-0">
                        <Select
                          label={t('admin.config.approval.staffSelectLabel', { name })}
                          labelHidden
                          value={value}
                          onValueChange={(v) => handleStaffChange(member.id, v as StaffPolicyValue)}
                          options={policyOptions}
                          disabled={saving}
                          helperText={
                            value === 'inherit'
                              ? salonAuto
                                ? t('admin.config.approval.effectiveAuto')
                                : t('admin.config.approval.effectiveManual')
                              : undefined
                          }
                          containerClassName="w-full"
                        />
                        {member.role === 'Stylist' && (
                          <Switch
                            checked={member.manageOwnAvailability}
                            onCheckedChange={(v) => handleStaffManageOwn(member.id, v)}
                            disabled={saving}
                            label={t('admin.config.approval.manageOwnLabel')}
                          />
                        )}
                        {member.role === 'Stylist' && (
                          <Switch
                            checked={member.canApproveOwnAppointments === true}
                            onCheckedChange={(v) => handleStaffApproveOwn(member.id, v)}
                            disabled={saving}
                            label={t('admin.config.approval.approveOwnLabel')}
                            helperText={t('admin.config.approval.approveOwnHelper')}
                          />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Subtle in-flight hint kept out of the way (ui-ux §6). */}
            {saving && (
              <p
                role="status"
                aria-live="polite"
                className="flex items-center gap-2 text-xs text-muted"
              >
                <Spinner size="sm" />
                {t('common.saving')}
              </p>
            )}
          </div>
        </div>
      )}
    </SectionShell>
  );
}

/** Brand-accent picker status: own loading / error / success surface. */
type BrandStatus = 'loading' | 'success' | 'error';

/**
 * Brand_Accent section (signature-ui-system R4.1): lets the Owner pick the
 * storefront accent from the curated `ACCENTS` (or clear it to the signature
 * default) with a **live `TenantTheme` preview**, persisting via
 * `brandAccentApi.set`. Like the approval-policy section it is a self-contained
 * data surface (own loading / error+retry / success) wired to the owner brand
 * routes (`GET /salons/:id/brand`, `POST /salons/:id/brand-accent`); edits are
 * optimistic and reconciled — a failed save rolls back and surfaces an error
 * toast (ui-ux §6, §12), a success confirms with a polite toast.
 *
 * The preview and swatches are tokens-only: the colors come from the runtime
 * accent override `TenantTheme` injects (`bg-primary`/`bg-accent`), never an
 * authored literal.
 */
function BrandAccentSection({ salonId }: { salonId: string }) {
  const { t } = useTranslation();
  const { success, error: toastError } = useToast();

  const [status, setStatus] = useState<BrandStatus>('loading');
  // '' = the signature default (no per-tenant accent).
  const [accent, setAccent] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setStatus('loading');
    let active = true;
    brandAccentApi
      .get(salonId)
      .then((res) => {
        if (!active) return;
        setAccent(res.brandAccent ?? '');
        setStatus('success');
      })
      .catch(() => {
        if (active) setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [salonId]);

  useEffect(() => load(), [load]);

  const options = useMemo(
    () => [
      { value: '', label: t('admin.config.brand.defaultOption') },
      ...ACCENTS.map((a) => ({
        value: a.key,
        label: t(`admin.config.brand.accents.${a.key}`),
      })),
    ],
    [t],
  );

  const handleChange = async (value: string) => {
    const prev = accent;
    setAccent(value); // optimistic
    setSaving(true);
    try {
      await brandAccentApi.set(salonId, value === '' ? null : value);
      success({ title: t('admin.config.brand.saved') });
    } catch {
      setAccent(prev); // reconcile/rollback
      toastError({ title: t('admin.config.brand.saveFailed') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionShell id={SECTION_IDS.brand} icon={Palette} title={t('admin.config.brand.title')}>
      {status === 'loading' && (
        <div
          data-testid="brand-loading"
          role="status"
          aria-busy="true"
          aria-label={t('admin.config.brand.loadingLabel')}
          className="flex flex-col gap-3"
        >
          <Skeleton variant="rect" className="h-12" />
          <Skeleton variant="rect" className="h-20" />
        </div>
      )}

      {status === 'error' && (
        <ErrorState
          title={t('admin.config.brand.errorTitle')}
          retryLabel={t('admin.config.retry')}
          onRetry={load}
        />
      )}

      {status === 'success' && (
        <div data-testid="brand-accent" className="flex flex-col gap-5">
          <p className="max-w-[60ch] text-sm text-muted">{t('admin.config.brand.body')}</p>

          <Select
            label={t('admin.config.brand.selectLabel')}
            value={accent}
            onValueChange={handleChange}
            options={options}
            disabled={saving}
            containerClassName="w-full sm:w-72"
          />

          {/* Live preview — the swatches re-tint via the runtime accent vars
              TenantTheme injects (tokens only). */}
          <TenantTheme accentKey={accent || null}>
            <div
              data-testid="brand-accent-preview"
              className="flex flex-wrap items-center gap-4 rounded-md border border-border bg-surface p-4"
            >
              <span className="text-xs font-semibold text-muted">
                {t('admin.config.brand.previewLabel')}
              </span>
              <span className="inline-flex h-10 items-center rounded-pill bg-primary px-4 text-sm font-bold text-primary-contrast">
                {t('admin.config.brand.previewCta')}
              </span>
              <span aria-hidden="true" className="inline-block h-10 w-10 rounded-md bg-accent" />
            </div>
          </TenantTheme>

          {saving && (
            <p
              role="status"
              aria-live="polite"
              className="flex items-center gap-2 text-xs text-muted"
            >
              <Spinner size="sm" />
              {t('common.saving')}
            </p>
          )}
        </div>
      )}
    </SectionShell>
  );
}

type ClosureStatus = 'loading' | 'success' | 'error';

/** Sort closures by date, then window start (full-day closures first per date). */
function sortClosures(list: SalonClosure[]): SalonClosure[] {
  return [...list].sort((a, b) => {
    if (a.onDate !== b.onDate) return a.onDate < b.onDate ? -1 : 1;
    const sa = a.startTime ?? '';
    const sb = b.startTime ?? '';
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  });
}

/**
 * Closures section: the salon's "closed" calendar. The owner can block a whole
 * day (a holiday — no bookings at all) or only an hour-range on a day (e.g. a
 * midday break or an early close). Wired to `holidaysApi` (list/add/remove);
 * the scheduling engine enforces every closure (the slot disappears from
 * availability and a direct booking is rejected).
 *
 * Self-contained data surface with its own loading / empty / error+retry /
 * success states (ui-ux §6); destructive removals confirm via the shared dialog
 * and offer an undo that re-adds the closure (ui-ux §1).
 */
function ClosuresSection({
  salonId,
  requestDelete,
}: {
  salonId: string;
  requestDelete: (state: DeleteState) => void;
}) {
  const { t } = useTranslation();
  const { success, error: toastError } = useToast();

  const [status, setStatus] = useState<ClosureStatus>('loading');
  const [closures, setClosures] = useState<SalonClosure[]>([]);
  const [saving, setSaving] = useState(false);

  // Add-form state. `mode` toggles between a full-day closure and an hour-range;
  // `toDate` (optional) turns a single day into a multi-day range.
  const [date, setDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [mode, setMode] = useState<'full' | 'range'>('full');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [formError, setFormError] = useState('');

  const load = useCallback(() => {
    setStatus('loading');
    let active = true;
    holidaysApi
      .list(salonId)
      .then((res) => {
        if (!active) return;
        setClosures(sortClosures(res.holidays));
        setStatus('success');
      })
      .catch(() => {
        if (active) setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [salonId]);

  useEffect(() => load(), [load]);

  const modeOptions = useMemo(
    () => [
      { value: 'full', label: t('admin.config.closures.modeFull') },
      { value: 'range', label: t('admin.config.closures.modeRange') },
    ],
    [t],
  );

  const closureLabel = useCallback(
    (c: SalonClosure): string =>
      c.startTime && c.endTime
        ? t('admin.config.closures.rangeSummary', { start: c.startTime, end: c.endTime })
        : t('admin.config.closures.fullDay'),
    [t],
  );

  const resetForm = () => {
    setDate('');
    setToDate('');
    setMode('full');
    setStart('');
    setEnd('');
    setFormError('');
  };

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!date) {
      setFormError(t('admin.config.closures.dateRequired'));
      return;
    }
    if (toDate && toDate < date) {
      setFormError(t('admin.config.closures.invalidDateRange'));
      return;
    }
    const isRange = mode === 'range';
    if (isRange) {
      if (!start || !end) {
        setFormError(t('admin.config.closures.timeRequired'));
        return;
      }
      if (start >= end) {
        setFormError(t('admin.config.closures.invalidRange'));
        return;
      }
    }
    setSaving(true);
    try {
      const res = await holidaysApi.add(salonId, {
        onDate: date,
        toDate: toDate || null,
        startTime: isRange ? start : null,
        endTime: isRange ? end : null,
      });
      // A multi-day range returns every created row in `holidays`; fall back to
      // the single `holiday` for a one-day closure.
      const added = res.holidays ?? [res.holiday];
      setClosures((prev) => sortClosures([...prev, ...added]));
      resetForm();
      success({ title: t('admin.config.closures.added') });
    } catch {
      toastError({ title: t('admin.config.closures.addFailed') });
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = (c: SalonClosure) => {
    requestDelete({
      id: c.id,
      label: closureLabel(c),
      onConfirm: () => {
        const prev = closures;
        setClosures((list) => list.filter((x) => x.id !== c.id)); // optimistic
        holidaysApi
          .remove(salonId, c.id)
          .then(() => {
            success({
              title: t('admin.config.closures.removed'),
              undoLabel: t('common.undo'),
              onUndo: () => {
                holidaysApi
                  .add(salonId, {
                    onDate: c.onDate,
                    startTime: c.startTime,
                    endTime: c.endTime,
                  })
                  .then((res) => setClosures((l) => sortClosures([...l, res.holiday])))
                  .catch(() => toastError({ title: t('admin.config.closures.addFailed') }));
              },
            });
          })
          .catch(() => {
            setClosures(prev); // reconcile/rollback
            toastError({ title: t('admin.config.closures.removeFailed') });
          });
      },
    });
  };

  return (
    <SectionShell id={SECTION_IDS.holidays} icon={CalendarOff} title={t('admin.holidays')}>
      <p className="max-w-[60ch] text-sm text-muted">{t('admin.config.closures.body')}</p>

      {status === 'loading' && (
        <div
          role="status"
          aria-busy="true"
          aria-label={t('admin.config.closures.loadingLabel')}
          className="flex flex-col gap-2"
        >
          <Skeleton variant="rect" className="h-10" />
          <Skeleton variant="rect" className="h-10" />
        </div>
      )}

      {status === 'error' && (
        <ErrorState
          title={t('admin.config.closures.errorTitle')}
          retryLabel={t('admin.config.retry')}
          onRetry={load}
        />
      )}

      {status === 'success' && (
        <>
          {closures.length === 0 ? (
            <ul data-testid="holidays-list" className="sr-only" aria-hidden="true" />
          ) : (
            <ul data-testid="holidays-list" className="flex flex-col divide-y divide-border">
              {closures.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-text">
                      <CalendarOff className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                      <JalaliDate value={c.onDate} withWeekday variant="numeric" />
                    </span>
                    {c.startTime && c.endTime ? (
                      <Badge status="warning">
                        <span dir="ltr" className="tabular-nums">
                          {c.startTime}–{c.endTime}
                        </span>
                      </Badge>
                    ) : (
                      <Badge status="danger">{t('admin.config.closures.fullDay')}</Badge>
                    )}
                  </span>
                  <IconButton
                    variant="danger"
                    aria-label={t('admin.config.removeItem', { name: closureLabel(c) })}
                    onClick={() => handleRemove(c)}
                    className="h-9 min-h-0 w-9 min-w-0 shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}

          {closures.length === 0 && (
            <EmptyState
              icon={<CalendarOff className="h-8 w-8" />}
              title={t('admin.config.closures.emptyTitle')}
              description={t('admin.config.closures.emptyBody')}
            />
          )}

          <form onSubmit={handleAdd} className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="sm:flex-1">
                <JalaliDatePicker
                  label={t('admin.config.closures.fromDateLabel')}
                  value={date || null}
                  onChange={(iso) => setDate(iso)}
                  variant="sheet"
                />
              </div>
              <div className="sm:flex-1">
                <JalaliDatePicker
                  label={t('admin.config.closures.toDateLabel')}
                  value={toDate || null}
                  min={date || null}
                  onChange={(iso) => setToDate(iso)}
                  variant="sheet"
                  helperText={t('admin.config.closures.toDateHelper')}
                />
              </div>
              <Select
                label={t('admin.config.closures.modeLabel')}
                value={mode}
                onValueChange={(v) => setMode(v as 'full' | 'range')}
                options={modeOptions}
                containerClassName="sm:w-52"
              />
            </div>

            {mode === 'range' && (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <TextField
                  type="time"
                  dir="ltr"
                  label={t('admin.config.closures.startLabel')}
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  containerClassName="sm:flex-1"
                />
                <TextField
                  type="time"
                  dir="ltr"
                  label={t('admin.config.closures.endLabel')}
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  containerClassName="sm:flex-1"
                />
              </div>
            )}

            {formError && (
              <p role="alert" className="text-sm text-danger">
                {formError}
              </p>
            )}

            <Button
              type="submit"
              startIcon={<Plus className="h-4 w-4" />}
              loading={saving}
              disabled={saving}
              className="self-start"
            >
              {t('admin.config.closures.addCta')}
            </Button>
          </form>
        </>
      )}
    </SectionShell>
  );
}

/** Role options for the staff add/edit controls (RBAC access level). */
const STAFF_ROLE_VALUES: StaffRole[] = ['Owner', 'Admin', 'Stylist'];
/** Iranian mobile pattern for an optional staff login phone. */
const STAFF_PHONE_RE = /^09\d{9}$/;

/**
 * Staff / user management section: add a stylist, admin, or owner to the salon
 * and manage their role (RBAC access), optional login phone (OTP sign-in), and
 * active flag. Wired to the owner endpoints (`GET/POST /salons/:id/staff`,
 * `PATCH /staff/:id`). The granular approval/availability permissions live in
 * the approval-policy section, so they are not duplicated here.
 *
 * Presentational over the parent's loaded `staff` list (so a staff load failure
 * still surfaces the page-level error state); mutations are optimistic and
 * reconciled — a failed save rolls back and surfaces an error (ui-ux §6, §12).
 */
function StaffSection({
  staff,
  salonId,
  onChange,
}: {
  staff: SalonStaff[];
  salonId: string;
  onChange: React.Dispatch<React.SetStateAction<SalonStaff[]>>;
}) {
  const { t } = useTranslation();
  const { success, error: toastError } = useToast();
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<StaffRole>('Stylist');
  const [phone, setPhone] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const roleOptions = useMemo(
    () => STAFF_ROLE_VALUES.map((r) => ({ value: r, label: t(`app.role.${r}`) })),
    [t],
  );

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    const name = fullName.trim();
    if (!name) {
      setFormError(t('admin.config.staff.nameRequired'));
      return;
    }
    const trimmedPhone = phone.trim();
    if (trimmedPhone && !STAFF_PHONE_RE.test(trimmedPhone)) {
      setFormError(t('admin.config.staff.invalidPhone'));
      return;
    }
    setSaving(true);
    try {
      const { staff: created } = await staffApi.create(salonId, {
        fullName: name,
        role,
        phone: trimmedPhone || null,
      });
      onChange((prev) => [...prev, created]);
      setFullName('');
      setRole('Stylist');
      setPhone('');
      success({ title: t('admin.config.staff.added') });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PHONE_TAKEN') {
        setFormError(t('admin.config.staff.phoneTaken'));
      } else {
        toastError({ title: t('admin.config.staff.addFailed') });
      }
    } finally {
      setSaving(false);
    }
  };

  const patchStaff = async (id: string, patch: StaffUpdateInput) => {
    const prev = staff;
    onChange((list) => list.map((s) => (s.id === id ? ({ ...s, ...patch } as SalonStaff) : s)));
    try {
      await staffApi.update(id, patch);
      success({ title: t('admin.config.staff.saved') });
    } catch (err) {
      onChange(prev); // reconcile/rollback
      if (err instanceof ApiError && err.code === 'PHONE_TAKEN') {
        toastError({ title: t('admin.config.staff.phoneTaken') });
      } else {
        toastError({ title: t('admin.config.staff.saveFailed') });
      }
    }
  };

  return (
    <SectionShell id={SECTION_IDS.staff} icon={Users} title={t('admin.staff')}>
      <p className="max-w-[60ch] text-sm text-muted">{t('admin.config.staff.body')}</p>

      {staff.length === 0 ? (
        <ul data-testid="staff-list" className="sr-only" aria-hidden="true" />
      ) : (
        <ul data-testid="staff-list" className="flex flex-col divide-y divide-border">
          {staff.map((member) => {
            const name = member.fullName ?? member.id;
            return (
              <li
                key={member.id}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="break-words text-sm font-medium text-text">{name}</span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                    <span>{t(`app.role.${member.role}`)}</span>
                    {member.phone ? (
                      <span dir="ltr" className="tabular-nums">
                        {member.phone}
                      </span>
                    ) : (
                      <span>{t('admin.config.staff.noLogin')}</span>
                    )}
                    {!member.active && (
                      <span className="text-danger">{t('admin.config.staff.inactive')}</span>
                    )}
                  </span>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-64 sm:shrink-0">
                  <Select
                    label={t('admin.config.staff.roleSelectLabel', { name })}
                    labelHidden
                    value={member.role}
                    onValueChange={(v) => patchStaff(member.id, { role: v as StaffRole })}
                    options={roleOptions}
                    containerClassName="w-full"
                  />
                  <Switch
                    checked={member.active}
                    onCheckedChange={(v) => patchStaff(member.id, { active: v })}
                    label={t('admin.config.staff.activeLabel')}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {staff.length === 0 && (
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title={t('admin.config.staff.emptyTitle')}
          description={t('admin.config.staff.emptyBody')}
        />
      )}

      <form onSubmit={handleAdd} className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <TextField
            label={t('admin.config.staff.addLabel')}
            placeholder={t('admin.config.staff.addPlaceholder')}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            containerClassName="sm:flex-1"
          />
          <Select
            label={t('admin.config.staff.roleLabel')}
            value={role}
            onValueChange={(v) => setRole(v as StaffRole)}
            options={roleOptions}
            containerClassName="sm:w-48"
          />
        </div>
        <TextField
          label={t('admin.config.staff.phoneLabel')}
          helperText={t('admin.config.staff.phoneHelper')}
          placeholder="09xxxxxxxxx"
          type="tel"
          inputMode="tel"
          dir="ltr"
          autoComplete="off"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        {formError && (
          <p role="alert" className="text-sm text-danger">
            {formError}
          </p>
        )}
        <Button
          type="submit"
          startIcon={<Plus className="h-4 w-4" />}
          loading={saving}
          disabled={saving}
          className="self-start"
        >
          {t('admin.config.staff.addCta')}
        </Button>
      </form>
    </SectionShell>
  );
}

function ConfigurationPageContent({ salonId: salonIdProp }: { salonId?: string }) {
  const { t } = useTranslation();
  const params = useParams<{ salonId?: string }>();
  const { success } = useToast();
  const sessionSalonId = useSalonId();
  const salonId = salonIdProp ?? params.salonId ?? sessionSalonId;

  const [status, setStatus] = useState<LoadStatus>('loading');
  const [error, setError] = useState('');
  const [staff, setStaff] = useState<SalonStaff[]>([]);
  const [chairs, setChairs] = useState<Entry[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [pendingDelete, setPendingDelete] = useState<DeleteState | null>(null);

  const load = useCallback(() => {
    setStatus('loading');
    setError('');

    let active = true;
    Promise.all([
      adminApi.getStaff(salonId),
      adminApi.getChairs(salonId),
      salonApi.getServices(salonId),
    ])
      .then(([staffRes, chairsRes, servicesRes]) => {
        if (!active) return;
        setStaff(staffRes.staff);
        setChairs(chairsRes.chairs.map((c, i) => toEntry(c, `chair-${i + 1}`)));
        setServices(servicesRes.services);
        setStatus('success');
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof ApiError ? err.message : t('booking.failed'));
        setStatus('error');
      });

    return () => {
      active = false;
    };
  }, [salonId, t]);

  useEffect(() => load(), [load]);

  /** Show the «بازگردانی» undo toast after a destructive action (ui-ux §1). */
  const undoToast = useCallback(
    (name: string, onUndo: () => void) => {
      success({
        title: t('admin.config.itemRemoved', { name }),
        undoLabel: t('common.undo'),
        onUndo,
      });
    },
    [success, t],
  );

  const restoreEntry = useCallback(
    (setter: React.Dispatch<React.SetStateAction<Entry[]>>) => (entry: Entry, index: number) => {
      undoToast(entry.label, () =>
        setter((prev) => {
          const next = [...prev];
          next.splice(Math.min(index, next.length), 0, entry);
          return next;
        }),
      );
    },
    [undoToast],
  );

  const restoreService = useCallback(
    (service: ServiceItem, index: number) => {
      undoToast(service.name, () =>
        setServices((prev) => {
          const next = [...prev];
          next.splice(Math.min(index, next.length), 0, service);
          return next;
        }),
      );
    },
    [undoToast],
  );

  const anchorNav = useMemo(
    () => [
      { id: SECTION_IDS.approval, label: t('admin.config.approval.title') },
      { id: SECTION_IDS.brand, label: t('admin.config.brand.title') },
      { id: SECTION_IDS.staff, label: t('admin.staff') },
      { id: SECTION_IDS.chairs, label: t('admin.chairs') },
      { id: SECTION_IDS.services, label: t('admin.services') },
      { id: SECTION_IDS.holidays, label: t('admin.holidays') },
    ],
    [t],
  );

  return (
    <div data-testid="admin-configuration" className="flex flex-col gap-6">
      <SeoHead title={t('seo.titles.adminConfiguration')} />

      <header className="flex flex-col gap-2">
        {/* Admin breadcrumb trail (ui-ux §8). */}
        <nav aria-label={t('admin.breadcrumb')}>
          <ol className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <li>
              <Link to="/admin/calendar" className="text-muted no-underline hover:text-text">
                {t('admin.home')}
              </Link>
            </li>
            <li className="flex items-center gap-2">
              <span aria-hidden="true">›</span>
              <span className="font-medium text-text" aria-current="page">
                {t('admin.configuration')}
              </span>
            </li>
          </ol>
        </nav>

        <h1 className="text-xl font-bold text-text">{t('admin.configuration')}</h1>
        <p className="max-w-[60ch] text-sm text-muted">{t('admin.config.subtitle')}</p>

        {/* In-page anchor nav to each section. */}
        <nav aria-label={t('admin.config.sectionsNav')} className="mt-1">
          <ul className="flex flex-wrap gap-2">
            {anchorNav.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className={cn(
                    'inline-flex min-h-[44px] items-center rounded-pill border border-border bg-surface px-4 text-sm text-text no-underline',
                    'transition-colors duration-fast ease-standard hover:bg-elevated',
                    'outline-none focus-visible:outline focus-visible:outline-2',
                    'focus-visible:outline-offset-2 focus-visible:outline-focus',
                  )}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      {status === 'loading' && (
        <div
          data-testid="config-loading"
          role="status"
          aria-busy="true"
          aria-label={t('admin.config.loadingLabel')}
          className="flex flex-col gap-6"
        >
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <Skeleton variant="text" className="mb-4 w-1/3" />
              <div className="flex flex-col gap-2">
                <Skeleton variant="rect" className="h-10" />
                <Skeleton variant="rect" className="h-10" />
              </div>
            </Card>
          ))}
        </div>
      )}

      {status === 'error' && (
        <ErrorState
          data-testid="config-error"
          title={t('admin.config.errorTitle')}
          description={error}
          retryLabel={t('admin.config.retry')}
          onRetry={load}
        />
      )}

      {status === 'success' && (
        <div className="flex flex-col gap-6">
          <ApprovalPolicySection salonId={salonId} />

          <BrandAccentSection salonId={salonId} />

          <StaffSection staff={staff} salonId={salonId} onChange={setStaff} />

          <EntrySection
            id={SECTION_IDS.chairs}
            listTestId="chairs-list"
            icon={Armchair}
            title={t('admin.chairs')}
            entries={chairs}
            onAdd={(label) => setChairs((prev) => [...prev, { id: `chair-${Date.now()}`, label }])}
            onRemove={(id) => setChairs((prev) => prev.filter((e) => e.id !== id))}
            onRestore={restoreEntry(setChairs)}
            addLabel={t('admin.config.chairs.addLabel')}
            addPlaceholder={t('admin.config.chairs.addPlaceholder')}
            addCta={t('admin.config.chairs.addCta')}
            emptyTitle={t('admin.config.chairs.emptyTitle')}
            emptyBody={t('admin.config.chairs.emptyBody')}
            requestDelete={setPendingDelete}
          />

          <ServicesSection
            services={services}
            onAdd={(service) =>
              setServices((prev) => [...prev, { id: `service-${Date.now()}`, ...service }])
            }
            onRemove={(id) => setServices((prev) => prev.filter((s) => s.id !== id))}
            onRestore={restoreService}
            requestDelete={setPendingDelete}
          />

          {/* Holidays sit behind the «تنظیمات پیشرفته» disclosure (ui-ux §1
              progressive disclosure). The list stays in the DOM so its testID
              and the anchor target resolve even while collapsed. */}
          <details className="group rounded-lg border border-border bg-surface">
            <summary
              className={cn(
                'flex min-h-[44px] cursor-pointer list-none items-center gap-2 rounded-lg px-5 py-3 text-sm font-medium text-text',
                'outline-none focus-visible:outline focus-visible:outline-2',
                'focus-visible:-outline-offset-2 focus-visible:outline-focus',
              )}
            >
              <CalendarOff className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
              {t('admin.config.advanced')}
            </summary>
            <div className="border-t border-border p-5">
              <p className="mb-4 max-w-[60ch] text-xs text-muted">
                {t('admin.config.advancedBody')}
              </p>
              <ClosuresSection salonId={salonId} requestDelete={setPendingDelete} />
            </div>
          </details>
        </div>
      )}

      {/* Shared confirm dialog for every destructive action (ui-ux §1). */}
      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        {pendingDelete && (
          <DialogContent closeLabel={t('common.cancel')}>
            <DialogTitle>
              {t('admin.config.confirmDeleteTitle', { name: pendingDelete.label })}
            </DialogTitle>
            <DialogDescription>{t('admin.config.confirmDeleteBody')}</DialogDescription>
            <div className="mt-5 flex items-center justify-end gap-2">
              <DialogClose asChild>
                <Button variant="secondary">{t('common.cancel')}</Button>
              </DialogClose>
              <Button
                variant="danger"
                onClick={() => {
                  pendingDelete.onConfirm();
                  setPendingDelete(null);
                }}
              >
                {t('common.delete')}
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

/**
 * Public entry point. The undo («بازگردانی») confirmation toasts surface
 * through the app-root `ToastProvider` in App.tsx — a nested per-page provider
 * would silo them from the app host (component tests supply their own).
 */
export function ConfigurationPage({ salonId }: { salonId?: string }) {
  return <ConfigurationPageContent salonId={salonId} />;
}
