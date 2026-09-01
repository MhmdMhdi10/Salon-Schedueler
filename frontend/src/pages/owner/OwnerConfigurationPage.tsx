import { useCallback, useEffect, useMemo, useState, FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Armchair,
  BellRing,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  CreditCard,
  Package,
  Plus,
  Search,
  Scissors,
  Trash2,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { normalizeDigits } from '@salon/shared';
import {
  adminApi,
  approvalPolicyApi,
  salonApi,
  staffApi,
  staffAvailabilityApi,
  ApiError,
  getApiErrorMessage,
  type SalonStaff,
  type DepositSettings,
  type SmsSettings,
  type SalonEquipment,
  type StaffRole,
  type StaffUpdateInput,
} from '../../api/client';
import { useSalonId } from '../../auth/useSalonId';
import { filterPhoneInput, normalizePhone } from '../../auth/phone';
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
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

type ConfigurationView = 'all' | 'team' | 'services';

const DEFAULT_DEPOSIT_SETTINGS: DepositSettings = {
  depositMethod: 'card_transfer',
  depositCardNumber: null,
  depositCardHolder: null,
  depositBankName: null,
};

interface ServiceItem {
  id: string;
  name: string;
  durationMinutes: number;
  durationMode?: 'fixed' | 'variable';
  minDurationMinutes?: number | null;
  maxDurationMinutes?: number | null;
  bufferMinutes?: number;
  priceRial: number;
  requiresDeposit?: boolean;
  depositRial?: number | null;
  depositType?: 'fixed' | 'percentage';
  depositPercent?: number | null;
  approvalStaffId?: string | null;
  staffIds?: string[];
}

interface ServiceDraft {
  name: string;
  durationMinutes: string;
  durationMode: 'fixed' | 'variable';
  minDurationMinutes: string;
  maxDurationMinutes: string;
  bufferMinutes: string;
  priceRial: string;
  requiresDeposit: boolean;
  depositRial: string;
  depositType: 'fixed' | 'percentage';
  depositPercent: string;
  approvalStaffId: string;
}

type ServicePatch = {
  name: string;
  durationMinutes: number;
  durationMode: 'fixed' | 'variable';
  minDurationMinutes?: number;
  maxDurationMinutes?: number;
  bufferMinutes: number;
  priceRial: number;
  requiresDeposit: boolean;
  depositRial: number | null;
  depositType: 'fixed' | 'percentage';
  depositPercent: number | null;
  approvalStaffId: string | null;
};

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
  kind?: string;
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
    if (typeof rec.id === 'string') {
      return {
        id: rec.id,
        label,
        kind: typeof rec.kind === 'string' ? rec.kind : undefined,
      };
    }
  }
  return { id: fallbackId, label };
}

function wholeNumber(value: string): number {
  const normalized = normalizeDigits(value).replace(/[\s,٬،]/g, '');
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function serviceDraftFrom(service: ServiceItem): ServiceDraft {
  return {
    name: service.name,
    durationMinutes: String(service.durationMinutes),
    durationMode: service.durationMode === 'variable' ? 'variable' : 'fixed',
    minDurationMinutes: String(service.minDurationMinutes ?? service.durationMinutes),
    maxDurationMinutes: String(service.maxDurationMinutes ?? service.durationMinutes),
    bufferMinutes: String(service.bufferMinutes ?? 0),
    priceRial: String(Math.floor(service.priceRial / 10)),
    requiresDeposit: service.requiresDeposit === true,
    depositRial: service.depositRial == null ? '' : String(Math.floor(service.depositRial / 10)),
    depositType: service.depositType === 'percentage' ? 'percentage' : 'fixed',
    depositPercent: service.depositPercent == null ? '' : String(service.depositPercent),
    approvalStaffId: service.approvalStaffId ?? 'auto',
  };
}

// ─── CollapsibleSection ──────────────────────────────────────────────────────

interface CollapsibleSectionProps {
  id: string;
  icon: LucideIcon;
  title: string;
  guideId?: string;
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
  guideId,
  defaultExpanded = true,
  children,
}: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const prefersReduced = useReducedMotion();

  return (
    <Card
      as="section"
      id={id}
      data-panel-guide={guideId}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-24 overflow-hidden"
    >
      <h2 id={`${id}-title`} className="m-0">
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
          <span className="flex min-w-0 items-center gap-3">
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
      </h2>

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
  chairs,
  salonId,
  onChange,
  onStaffAdded,
  requestDelete,
}: {
  staff: SalonStaff[];
  chairs: Entry[];
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
    const trimmedPhone = normalizePhone(phone);
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
      } else if (err instanceof ApiError && err.code === 'ASSIGNED_CHAIR_TAKEN') {
        toastError({ title: t('admin.config.staff.chairTaken') });
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

  const patchOwnApproval = async (id: string, allowed: boolean) => {
    const previous = staff;
    onChange((list) =>
      list.map((member) =>
        member.id === id ? { ...member, canApproveOwnAppointments: allowed } : member,
      ),
    );
    try {
      await approvalPolicyApi.setStaffCanApproveOwn(id, allowed);
      success({ title: t('admin.config.staff.approvalSaved') });
    } catch {
      onChange(previous);
      toastError({ title: t('admin.config.staff.approvalSaveFailed') });
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

  const reactivateStaff = async (id: string) => {
    await patchStaff(id, { active: true });
    window.dispatchEvent(new Event('salon-config-changed'));
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
                        {member.role === 'Stylist' && (
                          <Switch
                            checked={member.canApproveOwnAppointments === true}
                            onCheckedChange={(v) => void patchOwnApproval(member.id, v)}
                            label={t('admin.config.staff.approvalLabel')}
                            helperText={t('admin.config.staff.approvalHelper')}
                          />
                        )}
                        {member.role !== 'Admin' &&
                          chairs.some((chair) => chair.kind !== 'mobile') && (
                            <Select
                              label={t('admin.config.staff.chairLabel')}
                              labelHidden={false}
                              value={member.assignedChairId ?? 'none'}
                              onValueChange={(value) =>
                                void patchStaff(member.id, {
                                  assignedChairId: value === 'none' ? null : value,
                                })
                              }
                              options={[
                                {
                                  value: 'none',
                                  label: t('admin.config.staff.chairShared'),
                                },
                                ...chairs
                                  .filter((chair) => chair.kind !== 'mobile')
                                  .map((chair) => ({ value: chair.id, label: chair.label })),
                              ]}
                              helperText={t('admin.config.staff.chairHelper')}
                              containerClassName="w-full"
                            />
                          )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                {member.active ? (
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
                ) : (
                  <IconButton
                    variant="secondary"
                    aria-label={`فعال‌سازی ${name}`}
                    onClick={() => void reactivateStaff(member.id)}
                    className="h-9 min-h-0 w-9 min-w-0 shrink-0"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </IconButton>
                )}
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
          maxLength={14}
          value={phone}
          onChange={(e) => setPhone(filterPhoneInput(e.target.value))}
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
  onUpdate,
  onAdd,
  onRemove,
  requestDelete,
}: {
  services: ServiceItem[];
  staff: SalonStaff[];
  onStaffChange: (serviceId: string, staffIds: string[]) => Promise<void>;
  onUpdate: (serviceId: string, patch: ServicePatch) => Promise<void>;
  onAdd: (service: {
    name: string;
    durationMinutes: number;
    durationMode: 'fixed' | 'variable';
    minDurationMinutes: number | null;
    maxDurationMinutes: number | null;
    bufferMinutes: number;
    priceRial: number;
    requiresDeposit: boolean;
    depositRial: number | null;
    depositType: 'fixed' | 'percentage';
    depositPercent: number | null;
    approvalStaffId: string | null;
  }) => Promise<void>;
  onRemove: (id: string) => void;
  requestDelete: (state: DeleteState) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [duration, setDuration] = useState('');
  const [durationMode, setDurationMode] = useState<'fixed' | 'variable'>('fixed');
  const [minDuration, setMinDuration] = useState('');
  const [maxDuration, setMaxDuration] = useState('');
  const [price, setPrice] = useState('');
  const [requiresDeposit, setRequiresDeposit] = useState(false);
  const [deposit, setDeposit] = useState('');
  const [depositType, setDepositType] = useState<'fixed' | 'percentage'>('fixed');
  const [depositPercent, setDepositPercent] = useState('');
  const [approvalStaffId, setApprovalStaffId] = useState('auto');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ServiceDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [staffPickerServiceId, setStaffPickerServiceId] = useState<string | null>(null);
  const [staffPickerIds, setStaffPickerIds] = useState<string[]>([]);
  const [staffPickerSearch, setStaffPickerSearch] = useState('');
  const [staffPickerError, setStaffPickerError] = useState('');
  const [savingStaffPicker, setSavingStaffPicker] = useState(false);
  const {
    page,
    pageItems,
    total: servicesTotal,
    pageSize: servicesPageSize,
    goToPage,
  } = usePagination(services, 6);
  const eligibleStaff = staff.filter((member) => member.active && member.role !== 'Admin');
  const approvalStaff = staff.filter(
    (member) =>
      member.active &&
      (member.role !== 'Stylist' || member.canApproveOwnAppointments === true),
  );
  const approvalOptions = [
    { value: 'auto', label: 'طبق سیاست سالن و عضو انجام‌دهنده' },
    ...approvalStaff.map((member) => ({
      value: member.id,
      label: `${member.fullName ?? member.id}${member.role === 'Admin' ? ' (مدیر)' : ''}`,
    })),
  ];
  const staffPickerService = services.find((service) => service.id === staffPickerServiceId) ?? null;
  const normalizedStaffPickerSearch = staffPickerSearch.trim().toLocaleLowerCase();
  const filteredStaffPickerMembers = normalizedStaffPickerSearch
    ? eligibleStaff.filter((member) =>
        (member.fullName ?? member.id).toLocaleLowerCase().includes(normalizedStaffPickerSearch),
      )
    : eligibleStaff;
  const selectedEligibleStaffCount = eligibleStaff.filter((member) =>
    staffPickerIds.includes(member.id),
  ).length;
  const allEligibleStaffSelected =
    eligibleStaff.length > 0 && selectedEligibleStaffCount === eligibleStaff.length;
  const unavailableSelectedStaffCount = staffPickerIds.length - selectedEligibleStaffCount;

  const openStaffPicker = (service: ServiceItem) => {
    setStaffPickerServiceId(service.id);
    // Keep existing assignments, including inactive members, so opening the
    // picker and saving does not silently remove data that is not currently
    // selectable.
    setStaffPickerIds([...new Set(service.staffIds ?? [])]);
    setStaffPickerSearch('');
    setStaffPickerError('');
  };

  const closeStaffPicker = () => {
    if (savingStaffPicker) return;
    setStaffPickerServiceId(null);
    setStaffPickerSearch('');
    setStaffPickerError('');
  };

  const saveStaffPicker = async () => {
    if (!staffPickerService) return;
    setSavingStaffPicker(true);
    setStaffPickerError('');
    try {
      await onStaffChange(staffPickerService.id, staffPickerIds);
      setStaffPickerServiceId(null);
      setStaffPickerSearch('');
    } catch (reason) {
      setStaffPickerError(getApiErrorMessage(reason, 'ذخیره اعضای تیم انجام نشد.'));
    } finally {
      setSavingStaffPicker(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    const durationMinutes = wholeNumber(duration);
    const priceRial = wholeNumber(price) * 10;
    const depositRial = wholeNumber(deposit) * 10;
    const minDurationMinutes = wholeNumber(minDuration) || durationMinutes;
    const maxDurationMinutes = wholeNumber(maxDuration) || minDurationMinutes;
    const percent = wholeNumber(depositPercent);
    if (!trimmed) {
      setFormError('نام خدمت را وارد کنید.');
      return;
    }
    if (durationMinutes < 5 || durationMinutes > 480) {
      setFormError('مدت خدمت باید بین ۵ تا ۴۸۰ دقیقه باشد.');
      return;
    }
    if (durationMode === 'variable' && (maxDurationMinutes < minDurationMinutes || maxDurationMinutes > 480)) {
      setFormError('حداکثر مدت باید از حداقل مدت بیشتر و حداکثر ۴۸۰ دقیقه باشد.');
      return;
    }
    if (requiresDeposit && depositType === 'fixed' && depositRial <= 0) {
      setFormError('مبلغ بیعانه را وارد کنید.');
      return;
    }
    if (requiresDeposit && depositType === 'percentage' && (percent < 1 || percent > 100)) {
      setFormError('درصد بیعانه باید بین ۱ تا ۱۰۰ باشد.');
      return;
    }
    setFormError('');
    try {
      await onAdd({
        name: trimmed,
        durationMinutes,
        durationMode,
        minDurationMinutes: durationMode === 'variable' ? minDurationMinutes : null,
        maxDurationMinutes: durationMode === 'variable' ? maxDurationMinutes : null,
        bufferMinutes: 0,
        priceRial,
        requiresDeposit,
        depositRial: requiresDeposit && depositType === 'fixed' ? depositRial : null,
        depositType,
        depositPercent: requiresDeposit && depositType === 'percentage' ? percent : null,
        approvalStaffId: approvalStaffId === 'auto' ? null : approvalStaffId,
      });
      setName('');
      setDuration('');
      setDurationMode('fixed');
      setMinDuration('');
      setMaxDuration('');
      setPrice('');
      setRequiresDeposit(false);
      setDeposit('');
      setDepositType('fixed');
      setDepositPercent('');
      setApprovalStaffId('auto');
    } catch {
      // Parent owns the server error toast; keep values so retry is possible.
    }
  };

  const toggleEditing = (service: ServiceItem) => {
    setEditingId((current) => (current === service.id ? null : service.id));
    setDrafts((current) => ({
      ...current,
      [service.id]: current[service.id] ?? serviceDraftFrom(service),
    }));
  };

  const updateDraft = (serviceId: string, patch: Partial<ServiceDraft>) => {
    setDrafts((current) => ({
      ...current,
      [serviceId]: { ...current[serviceId], ...patch },
    }));
  };

  const saveService = async (service: ServiceItem) => {
    const draft = drafts[service.id] ?? serviceDraftFrom(service);
    const nameValue = draft.name.trim();
    const durationMinutes = wholeNumber(draft.durationMinutes);
    const bufferMinutes = wholeNumber(draft.bufferMinutes);
    const priceRial = wholeNumber(draft.priceRial) * 10;
    const depositRial = wholeNumber(draft.depositRial) * 10;
    const minDurationMinutes = wholeNumber(draft.minDurationMinutes) || durationMinutes;
    const maxDurationMinutes = wholeNumber(draft.maxDurationMinutes) || minDurationMinutes;
    const percent = wholeNumber(draft.depositPercent);
    if (!nameValue) {
      setFormError('نام خدمت را وارد کنید.');
      return;
    }
    if (durationMinutes < 5 || durationMinutes > 480) {
      setFormError('مدت خدمت باید بین ۵ تا ۴۸۰ دقیقه باشد.');
      return;
    }
    if (bufferMinutes < 0 || bufferMinutes > 120) {
      setFormError('فاصله بین نوبت‌ها باید بین ۰ تا ۱۲۰ دقیقه باشد.');
      return;
    }
    if (draft.durationMode === 'variable' && (maxDurationMinutes < minDurationMinutes || maxDurationMinutes > 480)) {
      setFormError('حداکثر مدت باید از حداقل مدت بیشتر و حداکثر ۴۸۰ دقیقه باشد.');
      return;
    }
    if (draft.requiresDeposit && draft.depositType === 'fixed' && depositRial <= 0) {
      setFormError('مبلغ بیعانه را وارد کنید.');
      return;
    }
    if (draft.requiresDeposit && draft.depositType === 'percentage' && (percent < 1 || percent > 100)) {
      setFormError('درصد بیعانه باید بین ۱ تا ۱۰۰ باشد.');
      return;
    }
    setFormError('');
    setSavingId(service.id);
    try {
      await onUpdate(service.id, {
        name: nameValue,
        durationMinutes,
        durationMode: draft.durationMode,
        ...(draft.durationMode === 'variable'
          ? { minDurationMinutes, maxDurationMinutes }
          : {}),
        bufferMinutes,
        priceRial,
        requiresDeposit: draft.requiresDeposit,
        depositRial: draft.requiresDeposit && draft.depositType === 'fixed' ? depositRial : null,
        depositType: draft.depositType,
        depositPercent: draft.requiresDeposit && draft.depositType === 'percentage' ? percent : null,
        approvalStaffId: draft.approvalStaffId === 'auto' ? null : draft.approvalStaffId,
      });
      setEditingId(null);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <>
      <CollapsibleSection
        id="services"
        icon={Scissors}
        title={t('admin.services')}
        guideId="owner-services"
      >
      <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/10 p-3">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-contrast">
          <Users className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
        <p className="m-0 text-sm font-bold text-text">مشخص کن چه اعضایی هر خدمت را ارائه می‌دهند</p>
        <p className="mt-1 text-xs leading-6 text-muted">
            برای هر خدمت یک یا چند عضو تیم انتخاب کن تا هنگام رزرو فقط افراد مرتبط نمایش داده شوند.
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
                  onClick={() => toggleEditing(service)}
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
                  <Money amountRial={service.priceRial} unit="toman" className="font-medium text-text" />
                  {service.requiresDeposit && (service.depositType === 'percentage' || service.depositRial != null) && (
                    <span className="font-medium text-primary">
                      {service.depositType === 'percentage'
                        ? `بیعانه ${service.depositPercent ?? 0}٪`
                        : `بیعانه ${Math.floor((service.depositRial ?? 0) / 10).toLocaleString('fa-IR')} تومان`}
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
                      عضو تیم متصل
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    aria-expanded={staffPickerServiceId === service.id}
                    onClick={() => openStaffPicker(service)}
                    className={cn(
                      'inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold text-primary',
                      'border-primary/40 bg-primary/10 transition-colors duration-fast hover:bg-primary/20',
                      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus',
                    )}
                  >
                    <Users className="h-4 w-4" aria-hidden="true" />
                    {service.staffIds?.some((staffId) =>
                      eligibleStaff.some((member) => member.id === staffId),
                    )
                      ? 'ویرایش اعضا'
                      : 'انتخاب اعضای تیم'}
                  </button>
                </div>
                {editingId === service.id && (
                  <div
                    id={`service-edit-${service.id}`}
                    className="mt-2 flex flex-col gap-2 rounded-lg border border-border bg-bg p-2"
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      <TextField
                        label="نام خدمت"
                        value={drafts[service.id]?.name ?? service.name}
                        onChange={(event) => updateDraft(service.id, { name: event.target.value })}
                      />
                      <TextField
                        label="مدت (دقیقه)"
                        inputMode="numeric"
                        dir="ltr"
                        value={drafts[service.id]?.durationMinutes ?? String(service.durationMinutes)}
                        onChange={(event) => updateDraft(service.id, { durationMinutes: event.target.value })}
                      />
                      <TextField
                        label="فاصله بین نوبت‌ها (دقیقه)"
                        inputMode="numeric"
                        dir="ltr"
                        value={drafts[service.id]?.bufferMinutes ?? String(service.bufferMinutes ?? 0)}
                        onChange={(event) => updateDraft(service.id, { bufferMinutes: event.target.value })}
                      />
                      <TextField
                        label="قیمت (تومان)"
                        inputMode="numeric"
                        dir="ltr"
                        value={drafts[service.id]?.priceRial ?? String(Math.floor(service.priceRial / 10))}
                        onChange={(event) => updateDraft(service.id, { priceRial: event.target.value })}
                      />
                    </div>
                    <Select
                      label="نوع زمان‌بندی"
                      value={drafts[service.id]?.durationMode ?? service.durationMode ?? 'fixed'}
                      onValueChange={(value) => updateDraft(service.id, { durationMode: value as ServiceDraft['durationMode'] })}
                      options={[
                        { value: 'fixed', label: 'زمان ثابت' },
                        { value: 'variable', label: 'زمان متغیر' },
                      ]}
                    />
                    {(drafts[service.id]?.durationMode ?? service.durationMode ?? 'fixed') === 'variable' && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <TextField
                          label="حداقل زمان (دقیقه)"
                          inputMode="numeric"
                          dir="ltr"
                          value={drafts[service.id]?.minDurationMinutes ?? String(service.minDurationMinutes ?? service.durationMinutes)}
                          onChange={(event) => updateDraft(service.id, { minDurationMinutes: event.target.value })}
                        />
                        <TextField
                          label="حداکثر زمان (دقیقه)"
                          inputMode="numeric"
                          dir="ltr"
                          value={drafts[service.id]?.maxDurationMinutes ?? String(service.maxDurationMinutes ?? service.durationMinutes)}
                          onChange={(event) => updateDraft(service.id, { maxDurationMinutes: event.target.value })}
                        />
                      </div>
                    )}
                    <Switch
                      checked={drafts[service.id]?.requiresDeposit ?? service.requiresDeposit === true}
                      onCheckedChange={(value) => updateDraft(service.id, { requiresDeposit: value })}
                      label="دریافت بیعانه"
                    />
                    {(drafts[service.id]?.requiresDeposit ?? service.requiresDeposit === true) && (
                      <>
                        <Select
                          label="نوع بیعانه"
                          value={drafts[service.id]?.depositType ?? service.depositType ?? 'fixed'}
                          onValueChange={(value) => updateDraft(service.id, { depositType: value as ServiceDraft['depositType'] })}
                          options={[
                            { value: 'fixed', label: 'مبلغ ثابت (تومان)' },
                            { value: 'percentage', label: 'درصدی از هزینه' },
                          ]}
                        />
                        {(drafts[service.id]?.depositType ?? service.depositType ?? 'fixed') === 'percentage' ? (
                          <TextField
                            label="درصد بیعانه"
                            inputMode="numeric"
                            dir="ltr"
                            value={drafts[service.id]?.depositPercent ?? String(service.depositPercent ?? '')}
                            onChange={(event) => updateDraft(service.id, { depositPercent: event.target.value })}
                            helperText="بین ۱ تا ۱۰۰ درصد"
                          />
                        ) : (
                          <TextField
                            label="مبلغ بیعانه (تومان)"
                            inputMode="numeric"
                            dir="ltr"
                            value={drafts[service.id]?.depositRial ?? String(service.depositRial == null ? '' : Math.floor(service.depositRial / 10))}
                            onChange={(event) => updateDraft(service.id, { depositRial: event.target.value })}
                          />
                        )}
                      </>
                    )}
                    <Select
                      label="مسئول تأیید رزرو این خدمت"
                      value={drafts[service.id]?.approvalStaffId ?? service.approvalStaffId ?? 'auto'}
                      onValueChange={(value) => updateDraft(service.id, { approvalStaffId: value })}
                      options={approvalOptions}
                      helperText="این عضو تیم پیامک رزروهای در انتظار را می‌گیرد و در صورت داشتن دسترسی می‌تواند آن‌ها را تأیید یا رد کند."
                    />
                    {formError && <p className="m-0 text-sm text-danger" role="alert">{formError}</p>}
                    <Button
                      type="button"
                      size="md"
                      loading={savingId === service.id}
                      disabled={savingId !== null}
                      startIcon={<CheckCircle2 className="h-4 w-4" />}
                      onClick={() => void saveService(service)}
                      className="self-start"
                    >
                      ذخیره تغییرات خدمت
                    </Button>
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
        <Select
          label="نوع زمان‌بندی"
          value={durationMode}
          onValueChange={(value) => setDurationMode(value as 'fixed' | 'variable')}
          options={[
            { value: 'fixed', label: 'زمان ثابت' },
            { value: 'variable', label: 'زمان متغیر' },
          ]}
        />
        {durationMode === 'variable' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="حداقل زمان (دقیقه)"
              inputMode="numeric"
              dir="ltr"
              value={minDuration}
              onChange={(event) => setMinDuration(event.target.value)}
              placeholder={duration || '۳۰'}
            />
            <TextField
              label="حداکثر زمان (دقیقه)"
              inputMode="numeric"
              dir="ltr"
              value={maxDuration}
              onChange={(event) => setMaxDuration(event.target.value)}
              placeholder="۱۲۰"
            />
          </div>
        )}
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
          <>
            <Select
              label="نوع بیعانه"
              value={depositType}
              onValueChange={(value) => setDepositType(value as 'fixed' | 'percentage')}
              options={[
                { value: 'fixed', label: 'مبلغ ثابت (تومان)' },
                { value: 'percentage', label: 'درصدی از هزینه' },
              ]}
            />
            {depositType === 'percentage' ? (
              <TextField
                label="درصد بیعانه"
                inputMode="numeric"
                dir="ltr"
                value={depositPercent}
                onChange={(e) => setDepositPercent(e.target.value)}
                helperText="بین ۱ تا ۱۰۰ درصد"
              />
            ) : (
              <TextField
                label="مبلغ بیعانه (تومان)"
                placeholder="۱۰۰۰۰۰"
                inputMode="numeric"
                dir="ltr"
                value={deposit}
                onChange={(e) => setDeposit(e.target.value)}
              />
            )}
          </>
        )}
        <Select
          label="مسئول تأیید رزرو این خدمت"
          value={approvalStaffId}
          onValueChange={setApprovalStaffId}
          options={approvalOptions}
          helperText="برای رزروهای در انتظار، پیامک به این عضو تیم می‌رسد."
        />
        <Button type="submit" startIcon={<Plus className="h-4 w-4" />} className="self-start">
          {t('admin.config.services.addCta')}
        </Button>
      </form>
      </CollapsibleSection>

      <Sheet
        open={Boolean(staffPickerService)}
        onOpenChange={(open) => {
          if (!open) closeStaffPicker();
        }}
      >
        <SheetContent
          side="inline-end"
          data-testid="service-staff-picker"
          className="flex flex-col gap-0"
        >
          {staffPickerService && (
            <>
              <div className="pe-10">
                <SheetTitle>انتخاب اعضای تیم</SheetTitle>
                <SheetDescription>
                  برای «{staffPickerService.name}» اعضایی را انتخاب کن که این خدمت را ارائه می‌دهند.
                </SheetDescription>
              </div>

              <div className="mt-4 rounded-xl border border-primary/30 bg-primary/10 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-text">اعضای انتخاب‌شده</span>
                  <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-bold text-primary-contrast">
                    {staffPickerIds.length.toLocaleString('fa-IR')} نفر
                  </span>
                </div>
                <p className="mt-1 text-xs leading-6 text-muted">
                  انتخاب‌ها بعد از زدن «ذخیره اعضا» ثبت می‌شوند.
                </p>
                {unavailableSelectedStaffCount > 0 && (
                  <p className="mt-1 text-xs leading-6 text-muted">
                    {unavailableSelectedStaffCount.toLocaleString('fa-IR')} عضو غیرفعال هم متصل است و
                    برای جلوگیری از حذف ناخواسته حفظ می‌شود.
                  </p>
                )}
              </div>

              {eligibleStaff.length > 4 && (
                <TextField
                  label="جست‌وجوی عضو تیم"
                  placeholder="نام عضو تیم را بنویس"
                  value={staffPickerSearch}
                  onChange={(event) => setStaffPickerSearch(event.target.value)}
                  containerClassName="mt-4"
                  endAdornment={<Search className="h-4 w-4 text-muted" aria-hidden="true" />}
                />
              )}

              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="m-0 text-sm font-bold text-text">اعضای قابل انتخاب</p>
                {eligibleStaff.length > 0 && (
                  <button
                    type="button"
                    className="min-h-10 rounded-md px-2 text-xs font-bold text-primary outline-none hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                    onClick={() =>
                      setStaffPickerIds((current) =>
                        allEligibleStaffSelected
                          ? current.filter(
                              (id) => !eligibleStaff.some((member) => member.id === id),
                            )
                          : [...new Set([...current, ...eligibleStaff.map((member) => member.id)])],
                      )
                    }
                  >
                    {allEligibleStaffSelected ? 'حذف همه' : 'انتخاب همه'}
                  </button>
                )}
              </div>

              {eligibleStaff.length === 0 ? (
                <p className="mt-3 rounded-xl border border-dashed border-border p-4 text-sm leading-7 text-muted">
                  ابتدا حداقل یک عضو تیم یا صاحب سالن اضافه کن.
                </p>
              ) : filteredStaffPickerMembers.length === 0 ? (
                <p className="mt-3 rounded-xl border border-dashed border-border p-4 text-sm leading-7 text-muted">
                  عضوی با این نام پیدا نشد.
                </p>
              ) : (
                <div
                  role="group"
                  aria-label="اعضای قابل انتخاب برای خدمت"
                  className="mt-3 grid max-h-[min(45dvh,24rem)] gap-2 overflow-y-auto pe-1"
                >
                  {filteredStaffPickerMembers.map((member) => {
                    const checked = staffPickerIds.includes(member.id);
                    const memberName = member.fullName?.trim() || member.id;
                    return (
                      <button
                        key={member.id}
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        data-testid={`service-staff-option-${member.id}`}
                        onClick={() =>
                          setStaffPickerIds((current) =>
                            checked
                              ? current.filter((id) => id !== member.id)
                              : [...current, member.id],
                          )
                        }
                        className={cn(
                          'flex min-h-14 w-full items-center gap-3 rounded-xl border p-3 text-start',
                          'transition-colors duration-fast outline-none',
                          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus',
                          checked
                            ? 'border-primary bg-primary/10'
                            : 'border-border bg-bg hover:bg-surface',
                        )}
                      >
                        <span
                          className={cn(
                            'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                            checked
                              ? 'bg-primary text-primary-contrast'
                              : 'bg-surface text-primary',
                          )}
                          aria-hidden="true"
                        >
                          {memberName.slice(0, 1)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-text">{memberName}</span>
                          <span className="mt-0.5 block text-xs text-muted">
                            {member.role === 'Owner' ? 'صاحب سالن' : 'عضو تیم'}
                          </span>
                        </span>
                        <span
                          className={cn(
                            'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border',
                            checked
                              ? 'border-primary bg-primary text-primary-contrast'
                              : 'border-border bg-bg text-transparent',
                          )}
                          aria-hidden="true"
                        >
                          <Check className="h-4 w-4" />
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {staffPickerError && (
                <p className="mt-3 text-sm text-danger" role="alert">
                  {staffPickerError}
                </p>
              )}

              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  variant="secondary"
                  fullWidth
                  disabled={savingStaffPicker}
                  onClick={closeStaffPicker}
                >
                  انصراف
                </Button>
                <Button
                  type="button"
                  fullWidth
                  loading={savingStaffPicker}
                  onClick={() => void saveStaffPicker()}
                >
                  ذخیره اعضا
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
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
        برای کم‌شدن پیام‌های اضافی، به‌صورت پیش‌فرض پیامک‌های کاری فقط برای عضو تیم نوبت می‌رود.
        ارسال برای صاحب سالن را از هر بخش جداگانه فعال کن.
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        {groups.map((group) => (
          <div key={group.title} className="flex flex-col gap-2 rounded-xl border border-border bg-bg p-3">
            <h3 className="m-0 text-sm font-bold text-text">{group.title}</h3>
            <Switch
              checked={settings[group.stylist]}
              onCheckedChange={(value) => void toggle(group.stylist, value)}
              label="برای عضو تیم نوبت"
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

function DepositSettingsSection({
  salonId,
  settings,
  onChange,
}: {
  salonId: string;
  settings: DepositSettings;
  onChange: React.Dispatch<React.SetStateAction<DepositSettings>>;
}) {
  const { success, error: toastError } = useToast();
  // Card-to-card is the only deposit method currently exposed in the panel.
  // Keep legacy API values out of this screen until the other methods are
  // intentionally reintroduced.
  const method: DepositSettings['depositMethod'] = 'card_transfer';
  const [cardNumber, setCardNumber] = useState(settings.depositCardNumber ?? '');
  const [cardHolder, setCardHolder] = useState(settings.depositCardHolder ?? '');
  const [bankName, setBankName] = useState(settings.depositBankName ?? '');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    setCardNumber(settings.depositCardNumber ?? '');
    setCardHolder(settings.depositCardHolder ?? '');
    setBankName(settings.depositBankName ?? '');
  }, [settings]);

  const save = async () => {
    const normalizedCard = normalizeDigits(cardNumber).replace(/[\s-]/g, '');
    if (method === 'card_transfer' && !/^\d{16}$/.test(normalizedCard)) {
      setFormError('شماره کارت باید ۱۶ رقم باشد.');
      return;
    }
    if (method === 'card_transfer' && cardHolder.trim().length < 2) {
      setFormError('نام صاحب کارت را وارد کن.');
      return;
    }
    setFormError('');
    setSaving(true);
    try {
      const saved = await adminApi.updateDepositSettings(salonId, {
        depositMethod: method,
        depositCardNumber: method === 'card_transfer' ? normalizedCard : null,
        depositCardHolder: method === 'card_transfer' ? cardHolder.trim() : null,
        depositBankName: method === 'card_transfer' ? bankName.trim() || null : null,
      });
      onChange(saved);
      success({ title: 'تنظیمات بیعانه ذخیره شد' });
    } catch (reason) {
      toastError({ title: reason instanceof ApiError ? reason.message : 'ذخیره تنظیمات بیعانه انجام نشد' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <CollapsibleSection id="deposit-settings" icon={CreditCard} title="روش دریافت بیعانه">
      <p className="m-0 text-sm leading-7 text-muted">
        مبلغ بیعانه برای هر خدمت جداگانه فعال می‌شود. این بخش فقط روش دریافت و اطلاعات کارت را تعیین می‌کند.
      </p>
      <Select
        label="روش پرداخت بیعانه"
        value={method}
        onValueChange={() => setFormError('')}
        options={[
          { value: 'card_transfer', label: 'کارت‌به‌کارت و ارسال رسید' },
        ]}
      />
      {method === 'card_transfer' && (
        <div className="grid gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3 sm:grid-cols-2">
          <TextField
            label="شماره کارت"
            value={cardNumber}
            onChange={(event) => setCardNumber(event.target.value)}
            inputMode="numeric"
            dir="ltr"
            placeholder="6037 0000 0000 0000"
          />
          <TextField
            label="نام صاحب کارت"
            value={cardHolder}
            onChange={(event) => setCardHolder(event.target.value)}
            placeholder="نام و نام خانوادگی"
          />
          <TextField
            label="نام بانک (اختیاری)"
            value={bankName}
            onChange={(event) => setBankName(event.target.value)}
            containerClassName="sm:col-span-2"
          />
        </div>
      )}
      {formError && <p role="alert" className="m-0 text-sm text-danger">{formError}</p>}
      <Button type="button" loading={saving} disabled={saving} onClick={() => void save()} className="self-start">
        ذخیره روش بیعانه
      </Button>
    </CollapsibleSection>
  );
}

// ─── Chairs Section ──────────────────────────────────────────────────────────

function ChairsSection({
  chairs,
  onAdd,
  onUpdate,
  onRemove,
  requestDelete,
}: {
  chairs: Entry[];
  onAdd: (label: string) => Promise<void>;
  onUpdate: (id: string, label: string) => Promise<void>;
  onRemove: (id: string) => void;
  requestDelete: (state: DeleteState) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const visibleChairs = useMemo(
    () => chairs.filter((chair) => chair.kind !== 'mobile'),
    [chairs],
  );
  const {
    page,
    pageItems,
    total: chairsTotal,
    pageSize: chairsPageSize,
    goToPage,
  } = usePagination(visibleChairs, 6);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) {
      try {
        await onAdd(trimmed);
        setValue('');
      } catch {
        // Parent owns the error toast; keep the value for retry.
      }
    }
  };

  const saveEdit = async (entry: Entry) => {
    const name = editingValue.trim();
    if (!name) {
      setFormError('نام صندلی را وارد کنید.');
      return;
    }
    setFormError('');
    setSavingId(entry.id);
    try {
      await onUpdate(entry.id, name);
      setEditingId(null);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <CollapsibleSection id="chairs" icon={Armchair} title={t('admin.chairs')}>
      {visibleChairs.length === 0 ? (
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
              {editingId === entry.id ? (
                <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-end">
                  <TextField
                    label="نام صندلی"
                    labelHidden
                    value={editingValue}
                    onChange={(event) => setEditingValue(event.target.value)}
                    containerClassName="min-w-0 flex-1"
                  />
                  <Button
                    type="button"
                    size="md"
                    loading={savingId === entry.id}
                    disabled={savingId !== null}
                    onClick={() => void saveEdit(entry)}
                    startIcon={<CheckCircle2 className="h-4 w-4" />}
                  >
                    ذخیره
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  className="min-h-10 min-w-0 break-words rounded px-1 text-start text-sm text-text hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                  onClick={() => {
                    setEditingId(entry.id);
                    setEditingValue(entry.label);
                    setFormError('');
                  }}
                  aria-label={`ویرایش ${entry.label}`}
                >
                  {entry.label}
                </button>
              )}
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
          {formError && <p className="m-0 text-sm text-danger" role="alert">{formError}</p>}
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

// ─── Equipment Section ──────────────────────────────────────────────────────

function EquipmentSection({
  equipment,
  onAdd,
  onUpdate,
  onRemove,
  requestDelete,
}: {
  equipment: SalonEquipment[];
  onAdd: (name: string) => Promise<void>;
  onUpdate: (id: string, name: string) => Promise<void>;
  onRemove: (id: string) => void;
  requestDelete: (state: DeleteState) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const {
    page,
    pageItems,
    total: equipmentTotal,
    pageSize: equipmentPageSize,
    goToPage,
  } = usePagination(equipment, 6);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const name = value.trim();
    if (!name) return;
    try {
      await onAdd(name);
      setValue('');
    } catch {
      // Parent owns the error toast; keep the value so retry is possible.
    }
  };

  const saveEdit = async (item: SalonEquipment) => {
    const name = editingValue.trim();
    if (!name) {
      setFormError('نام تجهیز را وارد کنید.');
      return;
    }
    setFormError('');
    setSavingId(item.id);
    try {
      await onUpdate(item.id, name);
      setEditingId(null);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <CollapsibleSection id="equipment" icon={Package} title={t('admin.equipment')}>
      {equipment.length === 0 ? (
        <>
          <ul data-testid="equipment-list" className="sr-only" aria-hidden="true" />
          <EmptyState
            icon={<Package className="h-8 w-8" />}
            title={t('admin.config.equipment.emptyTitle')}
            description={t('admin.config.equipment.emptyBody')}
          />
        </>
      ) : (
        <>
          <AnimatedList testId="equipment-list">
            {pageItems.map((item) => (
              <AnimatedListItem key={item.id} id={item.id}>
                {editingId === item.id ? (
                  <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-end">
                    <TextField
                      label="نام تجهیز"
                      labelHidden
                      value={editingValue}
                      onChange={(event) => setEditingValue(event.target.value)}
                      containerClassName="min-w-0 flex-1"
                    />
                    <Button
                      type="button"
                      size="md"
                      loading={savingId === item.id}
                      disabled={savingId !== null}
                      onClick={() => void saveEdit(item)}
                      startIcon={<CheckCircle2 className="h-4 w-4" />}
                    >
                      ذخیره
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="min-h-10 min-w-0 break-words rounded px-1 text-start text-sm text-text hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                    onClick={() => {
                      setEditingId(item.id);
                      setEditingValue(item.name);
                      setFormError('');
                    }}
                    aria-label={`ویرایش ${item.name}`}
                  >
                    {item.name}
                  </button>
                )}
                <IconButton
                  variant="danger"
                  aria-label={t('admin.config.removeItem', { name: item.name })}
                  onClick={() =>
                    requestDelete({
                      id: item.id,
                      label: item.name,
                      onConfirm: () => onRemove(item.id),
                    })
                  }
                  className="h-9 min-h-0 w-9 min-w-0 shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </AnimatedListItem>
            ))}
          </AnimatedList>
          {formError && <p className="m-0 text-sm text-danger" role="alert">{formError}</p>}
          <Pagination
            page={page}
            pageSize={equipmentPageSize}
            total={equipmentTotal}
            onPageChange={goToPage}
            testId="equipment-pagination"
          />
        </>
      )}

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-end"
      >
        <TextField
          label={t('admin.config.equipment.addLabel')}
          placeholder={t('admin.config.equipment.addPlaceholder')}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          containerClassName="sm:flex-1"
        />
        <Button type="submit" startIcon={<Plus className="h-4 w-4" />} className="shrink-0">
          {t('admin.config.equipment.addCta')}
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

function OwnerConfigPageContent({
  salonId: salonIdProp,
  view = 'all',
}: {
  salonId?: string;
  view?: ConfigurationView;
}) {
  const { t } = useTranslation();
  const params = useParams<{ salonId?: string }>();
  const { success, error: toastError } = useToast();
  const sessionSalonId = useSalonId();
  const salonId = salonIdProp ?? params.salonId ?? sessionSalonId;

  const [status, setStatus] = useState<LoadStatus>('loading');
  const [error, setError] = useState('');
  const [staff, setStaff] = useState<SalonStaff[]>([]);
  const [chairs, setChairs] = useState<Entry[]>([]);
  const [equipment, setEquipment] = useState<SalonEquipment[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [smsSettings, setSmsSettings] = useState<SmsSettings>(DEFAULT_SMS_SETTINGS);
  const [depositSettings, setDepositSettings] = useState<DepositSettings>(DEFAULT_DEPOSIT_SETTINGS);
  const [pendingDelete, setPendingDelete] = useState<DeleteState | null>(null);

  const load = useCallback(() => {
    setStatus('loading');
    setError('');

    let active = true;
    const smsSettingsRequest =
      typeof adminApi.getSmsSettings === 'function'
        ? adminApi.getSmsSettings(salonId).catch(() => DEFAULT_SMS_SETTINGS)
        : Promise.resolve(DEFAULT_SMS_SETTINGS);
    const depositSettingsRequest =
      typeof adminApi.getDepositSettings === 'function'
        ? adminApi.getDepositSettings(salonId).catch(() => DEFAULT_DEPOSIT_SETTINGS)
        : Promise.resolve(DEFAULT_DEPOSIT_SETTINGS);
    const equipmentRequest: Promise<{ equipment: SalonEquipment[] }> =
      typeof adminApi.getEquipment === 'function'
        ? adminApi.getEquipment(salonId)
        : Promise.resolve({ equipment: [] });
    Promise.all([
      adminApi.getStaff(salonId),
      adminApi.getChairs(salonId),
      salonApi.getServices(salonId),
      smsSettingsRequest,
      depositSettingsRequest,
      equipmentRequest,
    ])
      .then(([staffRes, chairsRes, servicesRes, smsSettingsRes, depositSettingsRes, equipmentRes]) => {
        if (!active) return;
        setStaff(staffRes.staff);
        setChairs(chairsRes.chairs.map((c, i) => toEntry(c, `chair-${i + 1}`)));
        setServices(servicesRes.services);
        setSmsSettings(smsSettingsRes);
        setDepositSettings(depositSettingsRes);
        setEquipment(equipmentRes.equipment);
        setStatus('success');
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(getApiErrorMessage(err, t('booking.failed')));
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

  const isTeamView = view === 'team';
  const isServicesView = view === 'services';
  const isAllView = view === 'all';
  const pageTitle = isTeamView
    ? t('owner.team.title')
    : isServicesView
      ? t('owner.services.title')
      : t('seo.titles.adminConfiguration');
  const pageSubtitle = isTeamView
    ? t('owner.team.subtitle')
    : isServicesView
      ? t('owner.services.subtitle')
      : t('admin.config.subtitle');

  return (
    <div data-testid="admin-configuration" className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <SeoHead title={pageTitle} />

      {/* Page header */}
      <header className="flex flex-col gap-1">
        <h1 className="text-xl text-display text-text">
          {isAllView ? t('admin.configuration') : pageTitle}
        </h1>
        <p className="max-w-[60ch] text-sm text-muted">{pageSubtitle}</p>
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
          {view === 'team' && (
            <div
              data-testid="owner-team-intro"
              className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/10 p-3"
            >
              <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-contrast">
                <Users className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="m-0 text-sm font-bold text-text">{t('owner.team.flowTitle')}</p>
                <p className="mt-1 text-xs leading-6 text-muted">{t('owner.team.flowBody')}</p>
              </div>
            </div>
          )}
          {isTeamView && (
            <StaffSection
              staff={staff}
              chairs={chairs}
              salonId={salonId}
              onChange={setStaff}
              onStaffAdded={() => {
                void adminApi.getChairs(salonId).then((result) => {
                  setChairs(result.chairs.map((chair, index) => toEntry(chair, `chair-${index + 1}`)));
                });
              }}
              requestDelete={setPendingDelete}
            />
          )}

          {isAllView && (
            <SmsSettingsSection
              salonId={salonId}
              settings={smsSettings}
              onChange={setSmsSettings}
            />
          )}

          {isAllView && (
            <DepositSettingsSection
              salonId={salonId}
              settings={depositSettings}
              onChange={setDepositSettings}
            />
          )}

          {isServicesView && (
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
                success({ title: 'اعضای تیم خدمت ذخیره شدند' });
              } catch (reason) {
                setServices(previous);
                toastError({ title: 'ذخیره اعضای تیم خدمت انجام نشد' });
                throw reason;
              }
            }}
            onUpdate={async (serviceId, patch) => {
              const previous = services;
              setServices((current) =>
                current.map((service) =>
                  service.id === serviceId ? { ...service, ...patch } : service,
                ),
              );
              try {
                const result = await adminApi.updateService(salonId, serviceId, patch);
                setServices((current) =>
                  current.map((service) =>
                    service.id === serviceId ? { ...service, ...result.service } : service,
                  ),
                );
                window.dispatchEvent(new Event('salon-config-changed'));
                success({ title: 'خدمت با موفقیت به‌روزرسانی شد' });
              } catch (reason) {
                setServices(previous);
                toastError({
                  title: getApiErrorMessage(reason, 'ذخیره خدمت انجام نشد'),
                });
                throw reason;
              }
            }}
            onAdd={(service) => {
              return adminApi.createService(salonId, service).then((res) => {
                setServices((prev) => [
                  ...prev,
                  {
                    ...res.service,
                    staffIds:
                      res.service.staffIds ??
                      staff
                        .filter((member) => member.active && member.role !== 'Admin')
                        .map((member) => member.id),
                  },
                ]);
                window.dispatchEvent(new Event('salon-config-changed'));
              }).catch((reason) => {
                toastError({
                  title: getApiErrorMessage(reason, 'افزودن خدمت انجام نشد'),
                });
                throw reason;
              });
            }}
            onRemove={(id) => {
              const removed = services.find((s) => s.id === id);
              const previous = services;
              setServices((prev) => prev.filter((s) => s.id !== id));
              const idx = removed ? services.findIndex((s) => s.id === id) : -1;
              adminApi.deleteService(salonId, id).then(() => {
                window.dispatchEvent(new Event('salon-config-changed'));
                if (!removed) return;
                undoToast(removed.name, () => {
                  void adminApi
                    .createService(salonId, {
                      name: removed.name,
                      durationMinutes: removed.durationMinutes,
                      durationMode: removed.durationMode ?? 'fixed',
                      minDurationMinutes: removed.minDurationMinutes ?? null,
                      maxDurationMinutes: removed.maxDurationMinutes ?? null,
                      bufferMinutes: removed.bufferMinutes ?? 0,
                      priceRial: removed.priceRial,
                      requiresDeposit: removed.requiresDeposit === true,
                      depositRial: removed.depositRial ?? null,
                      depositType: removed.depositType ?? 'fixed',
                      depositPercent: removed.depositPercent ?? null,
                      approvalStaffId: removed.approvalStaffId ?? null,
                    })
                    .then(async (res) => {
                      if (removed.staffIds !== undefined) {
                        await adminApi.setServiceStaff(salonId, res.service.id, removed.staffIds);
                      }
                      setServices((prev) => {
                        const next = [...prev];
                        next.splice(
                          Math.min(idx, next.length),
                          0,
                          { ...res.service, staffIds: removed.staffIds ?? res.service.staffIds },
                        );
                        return next;
                      });
                      window.dispatchEvent(new Event('salon-config-changed'));
                    })
                    .catch((reason) => {
                      toastError({
                        title: getApiErrorMessage(reason, 'بازگردانی خدمت انجام نشد'),
                      });
                    });
                });
              }).catch((reason) => {
                setServices(previous);
                toastError({
                        title: getApiErrorMessage(reason, 'حذف خدمت انجام نشد'),
                });
              });
            }}
            requestDelete={setPendingDelete}
            />
          )}

          {isAllView && (
            <ChairsSection
            chairs={chairs}
            onAdd={(label) => {
              return adminApi.createChair(salonId, { name: label }).then((res) => {
                setChairs((prev) => [...prev, toEntry(res.chair, res.chair.id)]);
                window.dispatchEvent(new Event('salon-config-changed'));
              }).catch((reason) => {
                toastError({
                      title: getApiErrorMessage(reason, 'افزودن صندلی انجام نشد'),
                });
                throw reason;
              });
            }}
            onUpdate={async (id, name) => {
              const previous = chairs;
              setChairs((current) =>
                current.map((chair) => (chair.id === id ? { ...chair, label: name } : chair)),
              );
              try {
                const result = await adminApi.updateChair(salonId, id, name);
                setChairs((current) =>
                  current.map((chair) => (chair.id === id ? toEntry(result.chair, id) : chair)),
                );
                window.dispatchEvent(new Event('salon-config-changed'));
                success({ title: 'نام صندلی به‌روزرسانی شد' });
              } catch (reason) {
                setChairs(previous);
                toastError({
                  title: getApiErrorMessage(reason, 'به‌روزرسانی صندلی انجام نشد'),
                });
                throw reason;
              }
            }}
            onRemove={(id) => {
              const removed = chairs.find((c) => c.id === id);
              const previous = chairs;
              setChairs((prev) => prev.filter((e) => e.id !== id));
              const idx = removed ? chairs.findIndex((c) => c.id === id) : -1;
              adminApi.deleteChair(salonId, id).then(() => {
                window.dispatchEvent(new Event('salon-config-changed'));
                if (!removed) return;
                undoToast(removed.label, () => {
                  void adminApi.setChairActive(salonId, id, true).then(() => {
                    setChairs((prev) => {
                      const next = prev.filter((entry) => entry.id !== id);
                      next.splice(Math.min(idx, next.length), 0, removed);
                      return next;
                    });
                    window.dispatchEvent(new Event('salon-config-changed'));
                  }).catch((reason) => {
                    toastError({
                      title: getApiErrorMessage(reason, 'بازگردانی صندلی انجام نشد'),
                    });
                  });
                });
              }).catch((reason) => {
                setChairs(previous);
                toastError({
                      title: getApiErrorMessage(reason, 'حذف صندلی انجام نشد'),
                });
              });
            }}
            requestDelete={setPendingDelete}
            />
          )}

          {isAllView && (
            <EquipmentSection
              equipment={equipment}
              onAdd={(name) => {
                return adminApi.createEquipment(salonId, { name }).then((res) => {
                  setEquipment((prev) => [...prev, res.equipment]);
                  window.dispatchEvent(new Event('salon-config-changed'));
                }).catch((reason) => {
                  toastError({
                    title: getApiErrorMessage(reason, 'افزودن تجهیزات انجام نشد'),
                  });
                  throw reason;
                });
              }}
              onUpdate={async (id, name) => {
                const previous = equipment;
                setEquipment((current) =>
                  current.map((item) => (item.id === id ? { ...item, name } : item)),
                );
                try {
                  const result = await adminApi.updateEquipment(salonId, id, name);
                  setEquipment((current) =>
                    current.map((item) => (item.id === id ? result.equipment : item)),
                  );
                  window.dispatchEvent(new Event('salon-config-changed'));
                  success({ title: 'نام تجهیز به‌روزرسانی شد' });
                } catch (reason) {
                  setEquipment(previous);
                  toastError({
                    title: getApiErrorMessage(reason, 'به‌روزرسانی تجهیز انجام نشد'),
                  });
                  throw reason;
                }
              }}
              onRemove={(id) => {
                const removed = equipment.find((item) => item.id === id);
                const previous = equipment;
                const index = removed ? equipment.findIndex((item) => item.id === id) : -1;
                setEquipment((prev) => prev.filter((item) => item.id !== id));
                adminApi.deleteEquipment(salonId, id).then(() => {
                  window.dispatchEvent(new Event('salon-config-changed'));
                  if (!removed) return;
                  undoToast(removed.name, () => {
                    void adminApi.setEquipmentActive(salonId, id, true).then(({ equipment: restored }) => {
                      setEquipment((prev) => {
                        const next = prev.filter((item) => item.id !== id);
                        next.splice(Math.min(index, next.length), 0, restored);
                        return next;
                      });
                      window.dispatchEvent(new Event('salon-config-changed'));
                    }).catch((reason) => {
                      toastError({
                        title: getApiErrorMessage(reason, 'بازگردانی تجهیزات انجام نشد'),
                      });
                    });
                  });
                }).catch((reason) => {
                  setEquipment(previous);
                  toastError({
                    title: getApiErrorMessage(reason, 'حذف تجهیزات انجام نشد'),
                  });
                });
              }}
              requestDelete={setPendingDelete}
            />
          )}

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
export function OwnerConfigPage({
  salonId,
  view = 'all',
}: {
  salonId?: string;
  view?: ConfigurationView;
}) {
  // Toasts surface through the app-root <ToastProvider> in App.tsx — a nested
  // per-page provider would silo this page's toasts from the app host.
  return <OwnerConfigPageContent salonId={salonId} view={view} />;
}
