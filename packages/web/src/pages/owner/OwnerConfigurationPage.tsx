import { useCallback, useEffect, useMemo, useState, FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Armchair,
  CalendarOff,
  ChevronDown,
  Clock,
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
  holidaysApi,
  salonApi,
  staffApi,
  ApiError,
  type ApprovalPolicyStaff,
  type SalonClosure,
  type SalonStaff,
  type StaffRole,
  type StaffUpdateInput,
} from '../../api/client';
import { useSalonId } from '../../auth/useSalonId';
import { SeoHead } from '../../components/seo';
import {
  Badge,
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
  JalaliDate,
  JalaliDatePicker,
  Money,
  Select,
  Skeleton,
  Spinner,
  Switch,
  TextField,
  ToastProvider,
  cn,
  useToast,
} from '../../components/ui';

/**
 * Redesigned Owner Configuration Page (Task 7.6; Req 8.4, 8.6, 8.7, 3.5, 11.4, 11.5).
 *
 * Card-based sections for Staff, Services, Chairs/Resources, Holidays with:
 * - Expand/collapse via AnimatePresence + motion.div height animation
 * - Rotate-chevron expand indicator
 * - Inline edit affordances
 * - Add/remove item animations (slide in/out)
 * - Skeleton loading + error+retry states
 * - Persian text, Jalali dates for holidays, Persian numerals
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
}

interface Entry {
  id: string;
  label: string;
}

interface DeleteState {
  id: string;
  label: string;
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

function sortClosures(list: SalonClosure[]): SalonClosure[] {
  return [...list].sort((a, b) => {
    if (a.onDate !== b.onDate) return a.onDate < b.onDate ? -1 : 1;
    const sa = a.startTime ?? '';
    const sb = b.startTime ?? '';
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  });
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
          'flex w-full items-center justify-between gap-3 p-5',
          'outline-none focus-visible:outline focus-visible:outline-2',
          'focus-visible:outline-offset-[-2px] focus-visible:outline-focus',
          'min-h-[44px] cursor-pointer rounded-lg',
          'transition-colors duration-fast ease-standard hover:bg-elevated',
        )}
      >
        <span className="flex items-center gap-3" id={`${id}-title`}>
          <Icon className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
          <span className="text-lg font-medium text-text">{title}</span>
        </span>
        <motion.span
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={
            prefersReduced
              ? { duration: 0 }
              : { duration: 0.25, ease: [0.2, 0, 0, 1] }
          }
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
            transition={
              prefersReduced
                ? { duration: 0 }
                : { duration: 0.3, ease: [0.2, 0, 0, 1] }
            }
            style={{ overflow: 'hidden' }}
          >
            <div className="flex flex-col gap-4 px-5 pb-5">
              {children}
            </div>
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
function AnimatedList({
  children,
  testId,
}: {
  children: React.ReactNode;
  testId: string;
}) {
  const prefersReduced = useReducedMotion();

  return (
    <ul data-testid={testId} className="flex flex-col divide-y divide-border">
      <AnimatePresence initial={false}>
        {prefersReduced ? (
          children
        ) : (
          children
        )}
      </AnimatePresence>
    </ul>
  );
}

/** Animated list item with slide-in/out transitions. */
function AnimatedListItem({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const prefersReduced = useReducedMotion();

  if (prefersReduced) {
    return (
      <li className="flex items-center justify-between gap-3 py-3">
        {children}
      </li>
    );
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
  requestDelete,
}: {
  staff: SalonStaff[];
  salonId: string;
  onChange: React.Dispatch<React.SetStateAction<SalonStaff[]>>;
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
    onChange((list) =>
      list.map((s) => (s.id === id ? ({ ...s, ...patch } as SalonStaff) : s)),
    );
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
        <AnimatedList testId="staff-list">
          {staff.map((member) => {
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
                        'inline-flex items-start text-start text-sm font-medium text-text',
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
                        <span dir="ltr" className="tabular-nums">{member.phone}</span>
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
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <IconButton
                  variant="danger"
                  aria-label={t('admin.config.removeItem', { name })}
                  onClick={() =>
                    requestDelete({
                      id: member.id,
                      label: name,
                      onConfirm: () => onChange((prev) => prev.filter((s) => s.id !== member.id)),
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
          <p role="alert" className="text-sm text-danger">{formError}</p>
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
  onAdd,
  onRemove,
  requestDelete,
}: {
  services: ServiceItem[];
  onAdd: (service: { name: string; durationMinutes: number; priceRial: number }) => void;
  onRemove: (id: string) => void;
  requestDelete: (state: DeleteState) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [duration, setDuration] = useState('');
  const [price, setPrice] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

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

  return (
    <CollapsibleSection id="services" icon={Scissors} title={t('admin.services')}>
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
        <AnimatedList testId="services-list">
          {services.map((service) => (
            <AnimatedListItem key={service.id} id={service.id}>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() =>
                    setEditingId(editingId === service.id ? null : service.id)
                  }
                  className={cn(
                    'inline-flex items-start text-start text-sm font-medium text-text',
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
                </span>
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
        <Button type="submit" startIcon={<Plus className="h-4 w-4" />} className="self-start">
          {t('admin.config.services.addCta')}
        </Button>
      </form>
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
        <AnimatedList testId="chairs-list">
          {chairs.map((entry) => (
            <AnimatedListItem key={entry.id} id={entry.id}>
              <span className="min-w-0 break-words text-sm text-text">
                {entry.label}
              </span>
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
      )}

      {/* Add form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-end">
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

// ─── Holidays/Closures Section ───────────────────────────────────────────────

function HolidaysSection({
  salonId,
  requestDelete,
}: {
  salonId: string;
  requestDelete: (state: DeleteState) => void;
}) {
  const { t } = useTranslation();
  const { success, error: toastError } = useToast();

  const [status, setStatus] = useState<LoadStatus>('loading');
  const [closures, setClosures] = useState<SalonClosure[]>([]);
  const [saving, setSaving] = useState(false);

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
    return () => { active = false; };
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
        setClosures((list) => list.filter((x) => x.id !== c.id));
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
                  .then((res) =>
                    setClosures((l) => sortClosures([...l, res.holiday])),
                  )
                  .catch(() =>
                    toastError({ title: t('admin.config.closures.addFailed') }),
                  );
              },
            });
          })
          .catch(() => {
            setClosures(prev);
            toastError({ title: t('admin.config.closures.removeFailed') });
          });
      },
    });
  };

  return (
    <CollapsibleSection
      id="holidays"
      icon={CalendarOff}
      title={t('admin.holidays')}
      defaultExpanded={false}
    >
      <p className="max-w-[60ch] text-sm text-muted">
        {t('admin.config.closures.body')}
      </p>

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
            <>
              <ul data-testid="holidays-list" className="sr-only" aria-hidden="true" />
              <EmptyState
                icon={<CalendarOff className="h-8 w-8" />}
                title={t('admin.config.closures.emptyTitle')}
                description={t('admin.config.closures.emptyBody')}
              />
            </>
          ) : (
            <AnimatedList testId="holidays-list">
              {closures.map((c) => (
                <AnimatedListItem key={c.id} id={c.id}>
                  <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-text">
                      <CalendarOff
                        className="h-4 w-4 shrink-0 text-muted"
                        aria-hidden="true"
                      />
                      <JalaliDate value={c.onDate} withWeekday variant="numeric" />
                    </span>
                    {c.startTime && c.endTime ? (
                      <Badge status="warning">
                        <span dir="ltr" className="tabular-nums">
                          {c.startTime}–{c.endTime}
                        </span>
                      </Badge>
                    ) : (
                      <Badge status="danger">
                        {t('admin.config.closures.fullDay')}
                      </Badge>
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
                </AnimatedListItem>
              ))}
            </AnimatedList>
          )}

          {/* Add closure form */}
          <form onSubmit={handleAdd} className="flex flex-col gap-3 border-t border-border pt-4">
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
              <p role="alert" className="text-sm text-danger">{formError}</p>
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
    </CollapsibleSection>
  );
}

// ─── Approval-Policy Section ─────────────────────────────────────────────────

/** Tri-state approval choice for a single stylist (maps to `boolean | null`). */
type StaffPolicyValue = 'inherit' | 'auto' | 'manual';

function toStaffValue(autoApprove: boolean | null | undefined): StaffPolicyValue {
  if (autoApprove === null || autoApprove === undefined) return 'inherit';
  return autoApprove ? 'auto' : 'manual';
}

function fromStaffValue(value: StaffPolicyValue): boolean | null {
  if (value === 'inherit') return null;
  return value === 'auto';
}

type PolicyStatus = 'loading' | 'success' | 'error';

/**
 * Approval-policy section for the owner config page. Mirrors the admin
 * `ApprovalPolicySection` but styled with the owner page's `CollapsibleSection`
 * wrapper. Lets the owner toggle the salon-wide auto-confirm setting plus an
 * optional per-stylist override (inherit / auto / manual).
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
    setSalonAuto(next);
    setSaving(true);
    try {
      await approvalPolicyApi.setSalon(salonId, next);
      success({ title: t('admin.config.approval.saved') });
    } catch {
      setSalonAuto(prev);
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
      setStaff(prev);
      toastError({ title: t('admin.config.approval.saveFailed') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <CollapsibleSection
      id="approval"
      icon={ShieldCheck}
      title={t('admin.config.approval.title')}
      defaultExpanded={false}
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
          data-testid="approval-error"
          title={t('admin.config.approval.errorTitle')}
          retryLabel={t('admin.config.retry')}
          onRetry={load}
        />
      )}

      {status === 'success' && (
        <div data-testid="approval-policy" className="flex flex-col gap-5">
          <p className="max-w-[60ch] text-sm text-muted">{t('admin.config.approval.body')}</p>

          <div className="rounded-md border border-border bg-bg p-4">
            <Switch
              checked={salonAuto}
              onCheckedChange={handleSalonToggle}
              disabled={saving}
              label={t('admin.config.approval.salonToggleLabel')}
              helperText={t('admin.config.approval.salonToggleHelper')}
            />
          </div>

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
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

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
      {[0, 1, 2, 3].map((i) => (
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

    return () => { active = false; };
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
    <div data-testid="admin-configuration" className="flex flex-col gap-5">
      <SeoHead title={t('seo.titles.adminConfiguration')} />

      {/* Page header */}
      <header className="flex flex-col gap-2">
        <nav aria-label={t('admin.breadcrumb')}>
          <ol className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <li>
              <Link to="/owner/calendar" className="text-muted no-underline hover:text-text">
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
            requestDelete={setPendingDelete}
          />

          <ServicesSection
            services={services}
            onAdd={(service) => {
              adminApi
                .createService(salonId, service)
                .then((res) => {
                  setServices((prev) => [...prev, res.service]);
                })
                .catch(() => {})
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
                  setChairs((prev) => [...prev, res.chair]);
                })
                .catch(() => {})
            }}
            onRemove={(id) => {
              const removed = chairs.find((c) => c.id === id);
              setChairs((prev) => prev.filter((e) => e.id !== id));
              if (removed) {
                const idx = chairs.findIndex((c) => c.id === id);
                undoToast(removed.label, () =>
                  setChairs((prev) => {
                    const next = [...prev];
                    next.splice(Math.min(idx, next.length), 0, removed);
                    return next;
                  }),
                );
              }
            }}
            requestDelete={setPendingDelete}
          />

          <HolidaysSection salonId={salonId} requestDelete={setPendingDelete} />

          <ApprovalPolicySection salonId={salonId} />
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

// ─── Public Export ───────────────────────────────────────────────────────────

/**
 * Redesigned Owner Configuration Page (Task 7.6).
 *
 * Card-based sections for Staff, Services, Chairs/Resources, Holidays with
 * expand/collapse animations (AnimatePresence + motion.div), inline edit
 * affordances (click field name to expand edit panel), add/remove item
 * animations (slide in/out), skeleton loading, error+retry, Persian text,
 * Jalali dates for holidays, responsive layout, tokens-only styling, logical
 * properties for RTL, and prefers-reduced-motion handling.
 *
 * Preserved test hooks: `admin-configuration`, `config-loading`, `config-error`,
 * `staff-list`, `chairs-list`, `services-list`, `holidays-list`.
 */
export function OwnerConfigPage({ salonId }: { salonId?: string }) {
  return (
    <ToastProvider>
      <OwnerConfigPageContent salonId={salonId} />
    </ToastProvider>
  );
}
