import { useCallback, useEffect, useMemo, useState, FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Armchair,
  CalendarOff,
  Clock,
  Plus,
  Scissors,
  Trash2,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { adminApi, salonApi, ApiError } from '../../api/client';
import { SeoHead } from '../../components/seo';
import {
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
  Money,
  Skeleton,
  TextField,
  ToastProvider,
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

const DEFAULT_SALON_ID = 'salon-1';

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
            <li
              key={entry.id}
              className="flex items-center justify-between gap-3 py-2"
            >
              <span className="min-w-0 break-words text-sm text-text">
                {entry.label}
              </span>
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
        <EmptyState icon={<Icon className="h-8 w-8" />} title={emptyTitle} description={emptyBody} />
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
            <li
              key={service.id}
              className="flex items-center justify-between gap-3 py-2"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="break-words text-sm font-medium text-text">
                  {service.name}
                </span>
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

function ConfigurationPageContent({ salonId: salonIdProp }: { salonId?: string }) {
  const { t } = useTranslation();
  const params = useParams<{ salonId?: string }>();
  const { success } = useToast();
  const salonId = salonIdProp ?? params.salonId ?? DEFAULT_SALON_ID;

  const [status, setStatus] = useState<LoadStatus>('loading');
  const [error, setError] = useState('');
  const [staff, setStaff] = useState<Entry[]>([]);
  const [chairs, setChairs] = useState<Entry[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [holidays, setHolidays] = useState<Entry[]>([]);
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
        setStaff(staffRes.staff.map((s, i) => toEntry(s, `staff-${i + 1}`)));
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
    (setter: React.Dispatch<React.SetStateAction<Entry[]>>) =>
      (entry: Entry, index: number) => {
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
              <Link
                to="/admin/calendar"
                className="text-muted no-underline hover:text-text"
              >
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
          <EntrySection
            id={SECTION_IDS.staff}
            listTestId="staff-list"
            icon={Users}
            title={t('admin.staff')}
            entries={staff}
            onAdd={(label) =>
              setStaff((prev) => [...prev, { id: `staff-${Date.now()}`, label }])
            }
            onRemove={(id) => setStaff((prev) => prev.filter((e) => e.id !== id))}
            onRestore={restoreEntry(setStaff)}
            addLabel={t('admin.config.staff.addLabel')}
            addPlaceholder={t('admin.config.staff.addPlaceholder')}
            addCta={t('admin.config.staff.addCta')}
            emptyTitle={t('admin.config.staff.emptyTitle')}
            emptyBody={t('admin.config.staff.emptyBody')}
            requestDelete={setPendingDelete}
          />

          <EntrySection
            id={SECTION_IDS.chairs}
            listTestId="chairs-list"
            icon={Armchair}
            title={t('admin.chairs')}
            entries={chairs}
            onAdd={(label) =>
              setChairs((prev) => [...prev, { id: `chair-${Date.now()}`, label }])
            }
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
              setServices((prev) => [
                ...prev,
                { id: `service-${Date.now()}`, ...service },
              ])
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
              <EntrySection
                id={SECTION_IDS.holidays}
                listTestId="holidays-list"
                icon={CalendarOff}
                title={t('admin.holidays')}
                entries={holidays}
                onAdd={(label) =>
                  setHolidays((prev) => [...prev, { id: `holiday-${Date.now()}`, label }])
                }
                onRemove={(id) =>
                  setHolidays((prev) => prev.filter((e) => e.id !== id))
                }
                onRestore={restoreEntry(setHolidays)}
                addLabel={t('admin.config.holidays.addLabel')}
                addPlaceholder={t('admin.config.holidays.addPlaceholder')}
                addCta={t('admin.config.holidays.addCta')}
                emptyTitle={t('admin.config.holidays.emptyTitle')}
                emptyBody={t('admin.config.holidays.emptyBody')}
                requestDelete={setPendingDelete}
              />
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
            <DialogDescription>
              {t('admin.config.confirmDeleteBody')}
            </DialogDescription>
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
 * Public entry point. Hosts its own {@link ToastProvider} so the undo
 * («بازگردانی») confirmation works whether the route is mounted standalone (as
 * in the component tests) or inside the admin shell.
 */
export function ConfigurationPage({ salonId }: { salonId?: string }) {
  return (
    <ToastProvider>
      <ConfigurationPageContent salonId={salonId} />
    </ToastProvider>
  );
}
