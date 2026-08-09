import { useCallback, useEffect, useMemo, useState, FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Armchair,
  BellRing,
  ChevronDown,
  Clock,
  Plus,
  Scissors,
  Trash2,
  Users,
  type LucideIcon,
} from 'lucide-react';
import {
  adminApi,
  salonApi,
  staffApi,
  staffAvailabilityApi,
  ApiError,
  type SalonStaff,
  type SmsSettings,
  type StaffRole,
  type StaffUpdateInput,
} from '../../api/client';
import { useSalonId } from '../../auth/useSalonId';
import { usePagination } from '../../hooks/usePagination';
import { SeoHead } from '../../components/seo';
import {
  Button,
  Card,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  EmptyState,
  ErrorState,
  IconButton,
  Money,
  Pagination,
  Select,
  Skeleton,
  Switch,
  TextField,
  cn,
  useToast,
} from '../../components/ui';

/**
 * Redesigned Owner Configuration Page (Task 7.6; Req 8.4, 8.6, 8.7, 3.5, 11.4, 11.5).
 *
 * Card-based sections for Staff, Services, Chairs/Resources with:
 * - Expand/collapse via AnimatePresence + motion.div height animation
 * - Rotate-chevron expand indicator
 * - Inline edit affordances
 * - Add/remove item animations (slide in/out)
 * - Skeleton loading + error+retry states
 * - Persian text and Persian numerals
 * - Responsive: single column mobile, wider on desktop
 * - Tokens-only styling, logical properties for RTL
 * - prefers-reduced-motion respected throughout
 */

// ─── Types ───────────────────────────────────────────────────────────────────

type LoadStatus = 'loading' | 'success' | 'error';

interface ServiceItem {
  id: string;
  name: string;
  durationMinutes: number;
  priceRial: number;
  requiresDeposit?: boolean;
  depositRial?: number | null;
  staffIds?: string[];
}

const DEFAULT_SMS_SETTINGS: SmsSettings = {
  ownerBooking: false,
  stylistBooking: true,
  ownerReminder: false,
  stylistReminder: true,
  ownerCancellation: false,
  stylistCancellation: true,
};

interface Entry {
  id: string;
  label: string;
}

interface DeleteState {
  id: string;
  label: string;
  kind?: 'delete' | 'deactivate';
  onConfirm: () => void;
}

// ─── Animation variants ──────────────────────────────────────────────────────

/** Expand/collapse content variants (opacity + height via clipPath). */
const collapseVariants = {
  collapsed: { opacity: 0, height: 0 },
  expanded: { opacity: 1, height: 'auto' },
};

/** Item slide-in/out for add/remove animations. */
const itemSlideVariants = {
  initial: { opacity: 0, x: -16 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 16, transition: { duration: 0.2 } },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function toEntry(item: unknown, fallbackId: string): Entry {
  const label = itemLabel(item);
  if (item && typeof item === 'object') {
    const rec = item as Record<string, unknown>;
    if (typeof rec.id === 'string') return { id: rec.id, label };
  }
  return { id: fallbackId, label };
}

// ─── CollapsibleSection ──────────────────────────────────────────────────────

interface CollapsibleSectionProps {
  id: string;
  icon: LucideIcon;
  title: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}

/**
 * A card section with expand/collapse animation. The chevron rotates on toggle.
 * Uses AnimatePresence + motion.div for smooth height transitions.
 * Respects prefers-reduced-motion by skipping transform animations.
 */
function CollapsibleSection({
  id,
  icon: Icon,
  title,
  defaultExpanded = true,
  children,
}: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const prefersReduced = useReducedMotion();

  return (
    <Card
      as="section"
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-24 overflow-hidden"
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={`${id}-content`}
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          'flex w-full items-center justify-between gap-3 p-4 sm:p-5',
          'outline-none focus-visible:outline focus-visible:outline-2',
          'focus-visible:outline-offset-[-2px] focus-visible:outline-focus',
          'min-h-[44px] cursor-pointer rounded-lg',
          'transition-colors duration-fast ease-standard hover:bg-elevated',
        )}
      >
        <span className="flex min-w-0 items-center gap-3" id={`${id}-title`}>
          <Icon className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
          <span className="min-w-0 break-words text-lg font-medium text-text">{title}</span>
        </span>
        <motion.span
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={prefersReduced ? { duration: 0 } : { duration: 0.25, ease: [0.2, 0, 0, 1] }}
          className="shrink-0 text-muted"
        >
          <ChevronDown className="h-5 w-5" aria-hidden="true" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            id={`${id}-content`}
            role="region"
            aria-labelledby={`${id}-title`}
            initial="collapsed"
            animate="expanded"
            exit="collapsed"
            variants={prefersReduced ? {} : collapseVariants}
            transition={prefersReduced ? { duration: 0 } : { duration: 0.3, ease: [0.2, 0, 0, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="flex flex-col gap-4 px-4 pb-4 sm:px-5 sm:pb-5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

// ─── AnimatedList helper ─────────────────────────────────────────────────────

/**
 * Wraps a list with AnimatePresence so items animate in/out.
 * Each child must have a unique `key` prop.
 */
function AnimatedList({ children, testId }: { children: React.ReactNode; testId: string }) {
  const prefersReduced = useReducedMotion();

  return (
    <ul data-testid={testId} className="flex flex-col divide-y divide-border">
      <AnimatePresence initial={false}>{prefersReduced ? children : children}</AnimatePresence>
    </ul>
  );
}

/** Animated list item with slide-in/out transitions. */
function AnimatedListItem({ id, children }: { id: string; children: React.ReactNode }) {
  const prefersReduced = useReducedMotion();

  if (prefersReduced) {
    return <li className="flex items-center justify-between gap-3 py-3">{children}</li>;
  }

  return (
    <motion.li
      key={id}
      layout
      variants={itemSlideVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}
      className="flex items-center justify-between gap-3 py-3"
    >
      {children}
    </motion.li>
  );
}

// ─── Staff Section ───────────────────────────────────────────────────────────

const STAFF_ROLE_VALUES: StaffRole[] = ['Owner', 'Admin', 'Stylist'];
const STAFF_PHONE_RE = /^09\d{9}$/;

function StaffSection({
  staff,
  salonId,
  onChange,
  onStaffAdded,
  requestDelete,
}: {
  staff: SalonStaff[];
  salonId: string;
  onChange: React.Dispatch<React.SetStateAction<SalonStaff[]>>;
  onStaffAdded: () => void;
  requestDelete: (state: DeleteState) => void;
}) {
  const { t } = useTranslation();
  const { success, error: toastError } = useToast();
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<StaffRole>('Stylist');
  const [phone, setPhone] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const {
    page,
    pageItems,
    total: staffTotal,
    pageSize: staffPageSize,
    goToPage,
  } = usePagination(staff, 6);

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
      onStaffAdded();
      window.dispatchEvent(new Event('salon-config-changed'));
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
      onChange(prev);
      if (err instanceof ApiError && err.code === 'PHONE_TAKEN') {
        toastError({ title: t('admin.config.staff.phoneTaken') });
      } else {
        toastError({ title: t('admin.config.staff.saveFailed') });
      }
    }
  };

  const patchOwnAvailability = async (id: string, allowed: boolean) => {
    const previous = staff;
    onChange((list) =>
      list.map((member) =>
        member.id === id ? { ...member, manageOwnAvailability: allowed } : member,
      ),
    );
    try {
      await staffAvailabilityApi.setManageOwn(id, allowed);
      success({ title: t('admin.config.staff.availabilitySaved') });
    } catch {
      onChange(previous);
      toastError({ title: t('admin.config.staff.availabilitySaveFailed') });
    }
  };

  const deactivateStaff = async (id: string, name: string) => {
    const previous = staff;
    onChange((list) => list.map((member) => (member.id === id ? { ...member, active: false } : member)));
    try {
      const { staff: updated } = await staffApi.update(id, { active: false });
      onChange((list) => list.map((member) => (member.id === id ? updated : member)));
      window.dispatchEvent(new Event('salon-config-changed'));
      success({ title: t('admin.config.staff.deactivated', { name }) });
    } catch {
      onChange(previous);
      toastError({ title: t('admin.config.staff.deactivateFailed') });
    }
  };

  return (
    <CollapsibleSection id="staff" icon={Users} title={t('admin.staff')}>
      {staff.length === 0 ? (
        <>
          <ul data-testid="staff-list" className="sr-only" aria-hidden="true" />
          <EmptyState
            icon={<Users className="h-8 w-8" />}
            title={t('admin.config.staff.emptyTitle')}
            description={t('admin.config.staff.emptyBody')}
          />
        </>
      ) : (
        <>
          <AnimatedList testId="staff-list">
            {pageItems.map((member) => {
            const name = member.fullName ?? member.id;
            const isEditing = editingId === member.id;
            return (
              <AnimatedListItem key={member.id} id={member.id}>
                <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => setEditingId(isEditing ? null : member.id)}
                      className={cn(
                        'inline-flex min-h-10 items-center text-start text-sm font-medium text-text',
                        'rounded px-1 -mx-1 transition-colors duration-fast',
                        'hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus',
                      )}
                      aria-label={t('admin.config.staff.editLabel', { name })}
                    >
                      {name}
                    </button>
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
                  {/* Inline edit panel */}
                  <AnimatePresence>
                    {isEditing && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
                        className="flex w-full flex-col gap-2 overflow-hidden sm:w-64 sm:shrink-0"
                      >
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
                        {member.role !== 'Admin' && (
                          <Switch
                            checked={member.manageOwnAvailability}
                            onCheckedChange={(v) => void patchOwnAvailability(member.id, v)}
                            label={t('admin.config.staff.availabilityLabel')}
                            helperText={t('admin.config.staff.availabilityHelper')}
                          />
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <IconButton
                  variant="danger"
                  aria-label={t('admin.config.staff.deactivateLabel', { name })}
                  onClick={() =>
                    requestDelete({
                      id: member.id,
                      label: name,
                      kind: 'deactivate',
                      onConfirm: () => void deactivateStaff(member.id, name),
                    })
                  }
                  className="h-9 min-h-0 w-9 min-w-0 shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </AnimatedListItem>
            );
            })}
          </AnimatedList>
          <Pagination
            page={page}
            pageSize={staffPageSize}
            total={staffTotal}
            onPageChange={goToPage}
            testId="staff-pagination"
          />
        </>
      )}

      {/* Add form */}
      <form onSubmit={handleAdd} className="flex flex-col gap-3 border-t border-border pt-4">
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
    </CollapsibleSection>
  );
}

// ─── Services Section ────────────────────────────────────────────────────────

function ServicesSection({
  services,
  staff,
  onStaffChange,
  onAdd,
  onRemove,
  requestDelete,
}: {
  services: ServiceItem[];
  staff: SalonStaff[];
  onStaffChange: (serviceId: string, staffIds: string[]) => Promise<void>;
  onAdd: (service: {
    name: string;
    durationMinutes: number;
    priceRial: number;
    requiresDeposit: boolean;
    depositRial?: number;
  }) => void;
  onRemove: (id: string) => void;
  requestDelete: (state: DeleteState) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [duration, setDuration] = useState('');
  const [price, setPrice] = useState('');
  const [requiresDeposit, setRequiresDeposit] = useState(false);
  const [deposit, setDeposit] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const {
    page,
    pageItems,
    total: servicesTotal,
    pageSize: servicesPageSize,
    goToPage,
  } = usePagination(services, 6);
  const eligibleStaff = staff.filter((member) => member.active && member.role !== 'Admin');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd({
      name: trimmed,
      durationMinutes: Number.parseInt(duration, 10) || 0,
      priceRial: Number.parseInt(price, 10) || 0,
      requiresDeposit,
      ...(requiresDeposit ? { depositRial: Number.parseInt(deposit, 10) || 0 } : {}),
    });
    setName('');
    setDuration('');
    setPrice('');
    setRequiresDeposit(false);
    setDeposit('');
  };

  return (
    <CollapsibleSection id="services" icon={Scissors} title={t('admin.services')}>
      <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/10 p-3">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-contrast">
          <Users className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="m-0 text-sm font-bold text-text">هر خدمت را به آرایشگرهایش وصل کن</p>
          <p className="mt-1 text-xs leading-6 text-muted">
            برای هر خدمت یک یا چند آرایشگر انتخاب کن تا هنگام رزرو فقط افراد مرتبط نمایش داده شوند.
          </p>
        </div>
      </div>
      {services.length === 0 ? (
        <>
          <ul data-testid="services-list" className="sr-only" aria-hidden="true" />
          <EmptyState
            icon={<Scissors className="h-8 w-8" />}
            title={t('admin.config.services.emptyTitle')}
            description={t('admin.config.services.emptyBody')}
          />
        </>
      ) : (
        <>
          <AnimatedList testId="services-list">
            {pageItems.map((service) => (
            <AnimatedListItem key={service.id} id={service.id}>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() => setEditingId(editingId === service.id ? null : service.id)}
                  className={cn(
                    'inline-flex min-h-10 items-center text-start text-sm font-medium text-text',
                    'rounded px-1 -mx-1 transition-colors duration-fast',
                    'hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus',
                  )}
                  aria-label={t('admin.config.services.editLabel', { name: service.name })}
                >
                  {service.name}
                </button>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('booking.durationMinutes', { count: service.durationMinutes })}
                  </span>
                  <Money amountRial={service.priceRial} className="font-medium text-text" />
                  {service.requiresDeposit && service.depositRial != null && (
                    <span className="font-medium text-primary">
                      {t('admin.config.services.depositSummary', {
                        amount: service.depositRial.toLocaleString('fa-IR'),
                        defaultValue: 'بیعانه {{amount}} ریال',
                      })}
                    </span>
                  )}
                </span>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                    <Users className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                    <span>
                      {(
                        service.staffIds?.filter((staffId) =>
                          eligibleStaff.some((member) => member.id === staffId),
                        ).length ?? 0
                      ).toLocaleString('fa-IR')}{' '}
                      آرایشگر متصل
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-expanded={editingId === service.id}
                    aria-controls={`service-staff-${service.id}`}
                    onClick={() => setEditingId(editingId === service.id ? null : service.id)}
                    className={cn(
                      'inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold text-primary',
                      'border-primary/40 bg-primary/10 transition-colors duration-fast hover:bg-primary/20',
                      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus',
                    )}
                  >
                    <Users className="h-4 w-4" aria-hidden="true" />
                    {editingId === service.id ? 'بستن' : 'انتخاب آرایشگر'}
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 transition-transform duration-fast',
                        editingId === service.id && 'rotate-180',
                      )}
                      aria-hidden="true"
                    />
                  </button>
                </div>
                {editingId === service.id && (
                  <div
                    id={`service-staff-${service.id}`}
                    className="mt-2 flex flex-col gap-2 rounded-lg border border-border bg-bg p-2"
                  >
                    <p className="m-0 text-xs font-semibold text-text">
                      چه کسی این خدمت را انجام می‌دهد؟
                    </p>
                    {eligibleStaff.length === 0 ? (
                      <p className="m-0 text-xs text-muted">ابتدا حداقل یک آرایشگر یا صاحب سالن اضافه کن.</p>
                    ) : (
                      <div className="grid max-h-44 gap-1 overflow-y-auto sm:grid-cols-2">
                        {eligibleStaff.map((member) => {
                          const checked = service.staffIds?.includes(member.id) ?? false;
                          return (
                            <label
                              key={member.id}
                              className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-2 text-xs text-text hover:bg-elevated"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  const current = service.staffIds ?? [];
                                  const next = checked
                                    ? current.filter((id) => id !== member.id)
                                    : [...current, member.id];
                                  void onStaffChange(service.id, next);
                                }}
                                className="h-4 w-4 accent-primary"
                              />
                              <span className="min-w-0 truncate">{member.fullName ?? member.id}</span>
                              {member.role === 'Owner' && <span className="text-muted">(مالک)</span>}
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <IconButton
                variant="danger"
                aria-label={t('admin.config.removeItem', { name: service.name })}
                onClick={() =>
                  requestDelete({
                    id: service.id,
                    label: service.name,
                    onConfirm: () => onRemove(service.id),
                  })
                }
                className="h-9 min-h-0 w-9 min-w-0 shrink-0"
              >
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </AnimatedListItem>
            ))}
          </AnimatedList>
          <Pagination
            page={page}
            pageSize={servicesPageSize}
            total={servicesTotal}
            onPageChange={goToPage}
            testId="services-pagination"
          />
        </>
      )}

      {/* Add form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 border-t border-border pt-4">
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
        <Switch
          checked={requiresDeposit}
          onCheckedChange={setRequiresDeposit}
          label={t('admin.config.services.depositToggleLabel', {
            defaultValue: 'دریافت بیعانه برای رزرو',
          })}
          helperText={t('admin.config.services.depositToggleHelper', {
            defaultValue: 'مشتری قبل از نهایی‌شدن نوبت به پرداخت بیعانه هدایت می‌شود.',
          })}
        />
        {requiresDeposit && (
          <TextField
            label={t('admin.config.services.depositLabel', {
              defaultValue: 'مبلغ بیعانه (ریال)',
            })}
            placeholder={t('admin.config.services.depositPlaceholder', {
              defaultValue: '۱۰۰۰۰۰',
            })}
            inputMode="numeric"
            dir="ltr"
            value={deposit}
            onChange={(e) => setDeposit(e.target.value)}
          />
        )}
        <Button type="submit" startIcon={<Plus className="h-4 w-4" />} className="self-start">
          {t('admin.config.services.addCta')}
        </Button>
      </form>
    </CollapsibleSection>
  );
}

function SmsSettingsSection({
  salonId,
  settings,
  onChange,
}: {
  salonId: string;
  settings: SmsSettings;
  onChange: React.Dispatch<React.SetStateAction<SmsSettings>>;
}) {
  const { success, error: toastError } = useToast();

  const toggle = async (field: keyof SmsSettings, value: boolean) => {
    const previous = settings;
    onChange((current) => ({ ...current, [field]: value }));
    try {
      const saved = await adminApi.updateSmsSettings(salonId, { [field]: value });
      onChange(saved);
      success({ title: 'تنظیمات پیامک ذخیره شد' });
    } catch {
      onChange(previous);
      toastError({ title: 'ذخیره تنظیمات پیامک انجام نشد' });
    }
  };

  const groups = [
    {
      title: 'رزرو جدید',
      owner: 'ownerBooking' as const,
      stylist: 'stylistBooking' as const,
    },
    {
      title: 'یادآوری نوبت',
      owner: 'ownerReminder' as const,
      stylist: 'stylistReminder' as const,
    },
    {
      title: 'لغو نوبت',
      owner: 'ownerCancellation' as const,
      stylist: 'stylistCancellation' as const,
    },
  ];

  return (
    <CollapsibleSection id="sms-settings" icon={BellRing} title="تنظیمات پیامک">
      <p className="m-0 text-sm leading-7 text-muted">
        برای کم‌شدن پیام‌های اضافی، به‌صورت پیش‌فرض پیامک‌های کاری فقط برای آرایشگر نوبت می‌رود.
        ارسال برای صاحب سالن را از هر بخش جداگانه فعال کن.
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        {groups.map((group) => (
          <div key={group.title} className="flex flex-col gap-2 rounded-xl border border-border bg-bg p-3">
            <h3 className="m-0 text-sm font-bold text-text">{group.title}</h3>
            <Switch
              checked={settings[group.stylist]}
              onCheckedChange={(value) => void toggle(group.stylist, value)}
              label="برای آرایشگر نوبت"
            />
            <Switch
              checked={settings[group.owner]}
              onCheckedChange={(value) => void toggle(group.owner, value)}
              label="برای صاحب سالن"
            />
          </div>
        ))}
      </div>
    </CollapsibleSection>
  );
}

// ─── Chairs Section ──────────────────────────────────────────────────────────

function ChairsSection({
  chairs,
  onAdd,
  onRemove,
  requestDelete,
}: {
  chairs: Entry[];
  onAdd: (label: string) => void;
  onRemove: (id: string) => void;
  requestDelete: (state: DeleteState) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const {
    page,
    pageItems,
    total: chairsTotal,
    pageSize: chairsPageSize,
    goToPage,
  } = usePagination(chairs, 6);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) {
      onAdd(trimmed);
      setValue('');
    }
  };

  return (
    <CollapsibleSection id="chairs" icon={Armchair} title={t('admin.chairs')}>
      {chairs.length === 0 ? (
        <>
          <ul data-testid="chairs-list" className="sr-only" aria-hidden="true" />
          <EmptyState
            icon={<Armchair className="h-8 w-8" />}
            title={t('admin.config.chairs.emptyTitle')}
            description={t('admin.config.chairs.emptyBody')}
          />
        </>
      ) : (
        <>
          <AnimatedList testId="chairs-list">
            {pageItems.map((entry) => (
            <AnimatedListItem key={entry.id} id={entry.id}>
              <span className="min-w-0 break-words text-sm text-text">{entry.label}</span>
              <IconButton
                variant="danger"
                aria-label={t('admin.config.removeItem', { name: entry.label })}
                onClick={() =>
                  requestDelete({
                    id: entry.id,
                    label: entry.label,
                    onConfirm: () => onRemove(entry.id),
                  })
                }
                className="h-9 min-h-0 w-9 min-w-0 shrink-0"
              >
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </AnimatedListItem>
            ))}
          </AnimatedList>
          <Pagination
            page={page}
            pageSize={chairsPageSize}
            total={chairsTotal}
            onPageChange={goToPage}
            testId="chairs-pagination"
          />
        </>
      )}

      {/* Add form */}
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-end"
      >
        <TextField
          label={t('admin.config.chairs.addLabel')}
          placeholder={t('admin.config.chairs.addPlaceholder')}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          containerClassName="sm:flex-1"
        />
        <Button type="submit" startIcon={<Plus className="h-4 w-4" />} className="shrink-0">
          {t('admin.config.chairs.addCta')}
        </Button>
      </form>
    </CollapsibleSection>
  );
}

// ─── Skeleton Loading State ──────────────────────────────────────────────────

function ConfigSkeleton() {
  return (
    <div
      data-testid="config-loading"
      role="status"
      aria-busy="true"
      aria-label="در حال بارگذاری تنظیمات"
      className="flex flex-col gap-4"
    >
      {[0, 1, 2].map((i) => (
        <Card key={i} className="overflow-hidden">
          <div className="flex items-center gap-3 p-5">
            <Skeleton variant="rect" className="h-5 w-5 rounded" />
            <Skeleton variant="text" className="w-1/3" />
          </div>
          <div className="flex flex-col gap-2 px-5 pb-5">
            <Skeleton variant="rect" className="h-10" />
            <Skeleton variant="rect" className="h-10" />
            <Skeleton variant="rect" className="h-8 w-1/2" />
          </div>
        </Card>
      ))}
    </div>
  );
}

// ─── Main Page Content ───────────────────────────────────────────────────────

function OwnerConfigPageContent({ salonId: salonIdProp }: { salonId?: string }) {
  const { t } = useTranslation();
  const params = useParams<{ salonId?: string }>();
  const { success, error: toastError } = useToast();
  const sessionSalonId = useSalonId();
  const salonId = salonIdProp ?? params.salonId ?? sessionSalonId;

  const [status, setStatus] = useState<LoadStatus>('loading');
  const [error, setError] = useState('');
  const [staff, setStaff] = useState<SalonStaff[]>([]);
  const [chairs, setChairs] = useState<Entry[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [smsSettings, setSmsSettings] = useState<SmsSettings>(DEFAULT_SMS_SETTINGS);
  const [pendingDelete, setPendingDelete] = useState<DeleteState | null>(null);

  const load = useCallback(() => {
    setStatus('loading');
    setError('');

    let active = true;
    const smsSettingsRequest =
      typeof adminApi.getSmsSettings === 'function'
        ? adminApi.getSmsSettings(salonId).catch(() => DEFAULT_SMS_SETTINGS)
        : Promise.resolve(DEFAULT_SMS_SETTINGS);
    Promise.all([
      adminApi.getStaff(salonId),
      adminApi.getChairs(salonId),
      salonApi.getServices(salonId),
      smsSettingsRequest,
    ])
      .then(([staffRes, chairsRes, servicesRes, smsSettingsRes]) => {
        if (!active) return;
        setStaff(staffRes.staff);
        setChairs(chairsRes.chairs.map((c, i) => toEntry(c, `chair-${i + 1}`)));
        setServices(servicesRes.services);
        setSmsSettings(smsSettingsRes);
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

  return (
    <div data-testid="admin-configuration" className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <SeoHead title={t('seo.titles.adminConfiguration')} />

      {/* Page header */}
      <header className="flex flex-col gap-1">
        <h1 className="text-xl text-display text-text">{t('admin.configuration')}</h1>
        <p className="max-w-[60ch] text-sm text-muted">{t('admin.config.subtitle')}</p>
      </header>

      {/* Loading skeleton */}
      {status === 'loading' && <ConfigSkeleton />}

      {/* Error state with retry */}
      {status === 'error' && (
        <ErrorState
          data-testid="config-error"
          title={t('admin.config.errorTitle')}
          description={error}
          retryLabel={t('admin.config.retry')}
          onRetry={load}
        />
      )}

      {/* Success: collapsible card sections */}
      {status === 'success' && (
        <div className="flex flex-col gap-4">
          <StaffSection
            staff={staff}
            salonId={salonId}
            onChange={setStaff}
            onStaffAdded={() => {
              void adminApi.getChairs(salonId).then((result) => {
                setChairs(result.chairs.map((chair, index) => toEntry(chair, `chair-${index + 1}`)));
              });
            }}
            requestDelete={setPendingDelete}
          />

          <SmsSettingsSection
            salonId={salonId}
            settings={smsSettings}
            onChange={setSmsSettings}
          />

          <ServicesSection
            services={services}
            staff={staff}
            onStaffChange={async (serviceId, staffIds) => {
              const previous = services;
              setServices((current) =>
                current.map((service) =>
                  service.id === serviceId ? { ...service, staffIds } : service,
                ),
              );
              try {
                await adminApi.setServiceStaff(salonId, serviceId, staffIds);
                success({ title: 'آرایشگرهای خدمت ذخیره شد' });
              } catch {
                setServices(previous);
                toastError({ title: 'ذخیره آرایشگرهای خدمت انجام نشد' });
              }
            }}
            onAdd={(service) => {
              adminApi
                .createService(salonId, service)
                .then((res) => {
                  setServices((prev) => [
                    ...prev,
                    { ...res.service, staffIds: res.service.staffIds ?? staff.filter((member) => member.active && member.role !== 'Admin').map((member) => member.id) },
                  ]);
                  window.dispatchEvent(new Event('salon-config-changed'));
                })
                .catch(() => {});
            }}
            onRemove={(id) => {
              const removed = services.find((s) => s.id === id);
              setServices((prev) => prev.filter((s) => s.id !== id));
              adminApi.deleteService(salonId, id).catch(() => {});
              if (removed) {
                const idx = services.findIndex((s) => s.id === id);
                undoToast(removed.name, () =>
                  setServices((prev) => {
                    const next = [...prev];
                    next.splice(Math.min(idx, next.length), 0, removed);
                    return next;
                  }),
                );
              }
            }}
            requestDelete={setPendingDelete}
          />

          <ChairsSection
            chairs={chairs}
            onAdd={(label) => {
              adminApi
                .createChair(salonId, { name: label })
                .then((res) => {
                  setChairs((prev) => [...prev, toEntry(res.chair, res.chair.id)]);
                  window.dispatchEvent(new Event('salon-config-changed'));
                })
                .catch(() => {});
            }}
            onRemove={(id) => {
              const removed = chairs.find((c) => c.id === id);
              let undone = false;
              setChairs((prev) => prev.filter((e) => e.id !== id));
              const removal = adminApi.deleteChair(salonId, id).then(() => {
                window.dispatchEvent(new Event('salon-config-changed'));
              }).catch(() => {
                if (removed && !undone) setChairs((prev) => [...prev, removed]);
              });
              if (removed) {
                const idx = chairs.findIndex((c) => c.id === id);
                undoToast(removed.label, () => {
                  undone = true;
                  void removal.then(() =>
                    adminApi.setChairActive(salonId, id, true).then(() => {
                      window.dispatchEvent(new Event('salon-config-changed'));
                    }),
                  );
                  setChairs((prev) => {
                    const next = [...prev];
                    next.splice(Math.min(idx, next.length), 0, removed);
                    return next;
                  });
                });
              }
            }}
            requestDelete={setPendingDelete}
          />

        </div>
      )}

      {/* Shared confirm dialog for destructive actions */}
      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        {pendingDelete && (
          <DialogContent closeLabel={t('common.cancel')}>
            <DialogTitle>
              {pendingDelete.kind === 'deactivate'
                ? t('admin.config.staff.confirmDeactivateTitle', { name: pendingDelete.label })
                : t('admin.config.confirmDeleteTitle', { name: pendingDelete.label })}
            </DialogTitle>
            <DialogDescription>
              {pendingDelete.kind === 'deactivate'
                ? t('admin.config.staff.confirmDeactivateBody')
                : t('admin.config.confirmDeleteBody')}
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
                {pendingDelete.kind === 'deactivate'
                  ? t('admin.config.staff.deactivateCta')
                  : t('common.delete')}
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

// ─── Public Export ───────────────────────────────────────────────────────────

/**
 * Redesigned Owner Configuration Page (Task 7.6).
 *
 * Card-based sections for Staff, Services, Chairs/Resources with
 * expand/collapse animations (AnimatePresence + motion.div), inline edit
 * affordances (click field name to expand edit panel), add/remove item
 * animations (slide in/out), skeleton loading, error+retry, Persian text,
 * responsive layout, tokens-only styling, logical
 * properties for RTL, and prefers-reduced-motion handling.
 *
 * Preserved test hooks: `admin-configuration`, `config-loading`, `config-error`,
 * `staff-list`, `chairs-list`, `services-list`.
 */
export function OwnerConfigPage({ salonId }: { salonId?: string }) {
  // Toasts surface through the app-root <ToastProvider> in App.tsx — a nested
  // per-page provider would silo this page's toasts from the app host.
  return <OwnerConfigPageContent salonId={salonId} />;
}
