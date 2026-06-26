import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarClock, Clock, Scissors } from 'lucide-react';
import { salonApi } from '../api/client';
import { SeoHead } from '../components/seo';
import {
  EmptyState,
  ErrorState,
  JalaliDatePicker,
  Money,
  RadioGroup,
  Skeleton,
  SlotGrid,
  type SlotItem,
  type SlotState,
} from '../components/ui';

/** A bookable service as returned by the salon services endpoint (unchanged contract). */
interface Service {
  id: string;
  name: string;
  durationMinutes: number;
  priceRial: number;
}

/** A free time slot as returned by the availability endpoint (unchanged contract). */
interface Slot {
  startAt: string;
  endAt: string;
}

/** A simple async-resource status used by the service list and the slot grid. */
type Status = 'idle' | 'loading' | 'error' | 'ready';

/**
 * Persisted funnel selection so a customer who advances to confirm and then
 * navigates **back** lands on the availability step with their service and date
 * still chosen (ui-ux §8 "back returns without losing state"). Scoped per salon
 * in `sessionStorage` so it never bleeds across salons or survives the session.
 */
interface PersistedSelection {
  serviceId: string;
  date: string;
}

function selectionKey(salonId: string): string {
  return `booking-selection:${salonId}`;
}

function readSelection(salonId: string | undefined): PersistedSelection | null {
  if (!salonId || typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(selectionKey(salonId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedSelection>;
    if (typeof parsed.serviceId !== 'string' || typeof parsed.date !== 'string') {
      return null;
    }
    return { serviceId: parsed.serviceId, date: parsed.date };
  } catch {
    return null;
  }
}

function writeSelection(salonId: string, selection: PersistedSelection): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(selectionKey(salonId), JSON.stringify(selection));
  } catch {
    // Best-effort persistence; a storage failure must never break the funnel.
  }
}

/** Today as a `YYYY-MM-DD` local date — the inclusive lower bound for the picker. */
function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Formats an ISO instant to an `HH:mm` label; SlotChip localizes the digits. */
function slotLabel(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Reports whether the viewport is phone-sized (below the `md` breakpoint), so
 * the date picker opens as a thumb-friendly **bottom sheet** on mobile and as a
 * popover on larger screens (ui-ux §5). Defaults to `false` (popover) in
 * environments without `matchMedia`.
 */
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);
  return isMobile;
}

/**
 * Customer availability step at `/salon/:salonId/book` (R4.4, R7.2, R7.5, R7.8,
 * R2.3; ui-ux Availability recipe, §6, §7, §11).
 *
 * The core of the booking funnel. The redesign composes the design-system
 * primitives instead of bare HTML:
 *
 *  - **Service selector** — a `RadioGroup` of cards, each showing the service
 *    name, its duration, and its **Rial price** via `<Money>` (R4.4, R7.5). The
 *    list carries its own loading (skeleton) / error (retry) / empty states.
 *  - **Jalali date picker** — `<JalaliDatePicker>` replaces the native
 *    `<input type="date">` (ui-ux §11): Persian months/digits, Iranian-week
 *    order, ISO at the API boundary only. It opens as a **bottom sheet** on
 *    mobile and a popover on desktop. Past dates are disabled.
 *  - **Slot chip grid** — `<SlotGrid>` renders the five slot states
 *    (available/selected/held/full/past), each distinguishable **without color**
 *    (R2.6). The grid moves through skeleton chips → empty card
 *    («این روز نوبت خالی ندارد، روز دیگری انتخاب کنید») → populated chips
 *    (ui-ux §6).
 *
 * Selecting a slot advances to confirm and **persists the selection** so back
 * navigation restores the chosen service and date (ui-ux §8). The
 * `availability-page` testID is preserved so existing tests stay green, and the
 * `salonApi` calls are unchanged.
 *
 * A booking-funnel step is thin/duplicate content and must never be indexed;
 * `<SeoHead>` (noindex default) emits `noindex,follow` (seo §1, R8.7).
 */
export function AvailabilityPage() {
  const { t } = useTranslation();
  const { salonId } = useParams<{ salonId: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const minDate = useMemo(() => todayISO(), []);

  // Restore any persisted selection so back-navigation keeps the user's place.
  const restored = useMemo(() => readSelection(salonId), [salonId]);

  const [services, setServices] = useState<Service[]>([]);
  const [servicesStatus, setServicesStatus] = useState<Status>('idle');
  const [selectedService, setSelectedService] = useState(restored?.serviceId ?? '');
  const [date, setDate] = useState(restored?.date ?? '');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsStatus, setSlotsStatus] = useState<Status>('idle');

  // Load the salon's services (with loading + error states).
  const loadServices = useCallback(() => {
    if (!salonId) return;
    setServicesStatus('loading');
    salonApi
      .getServices(salonId)
      .then((res) => {
        setServices(res.services);
        setServicesStatus('ready');
      })
      .catch(() => setServicesStatus('error'));
  }, [salonId]);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  // Load availability whenever a service + date are both chosen.
  const loadSlots = useCallback(() => {
    if (!salonId || !selectedService || !date) {
      setSlotsStatus('idle');
      setSlots([]);
      return;
    }
    setSlotsStatus('loading');
    salonApi
      .getAvailability(salonId, selectedService, date)
      .then((res) => {
        setSlots(res.slots);
        setSlotsStatus('ready');
      })
      .catch(() => setSlotsStatus('error'));
  }, [salonId, selectedService, date]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  const handleServiceChange = (value: string) => {
    setSelectedService(value);
    if (salonId && date) writeSelection(salonId, { serviceId: value, date });
  };

  const handleDateChange = (value: string) => {
    setDate(value);
    if (salonId && selectedService) {
      writeSelection(salonId, { serviceId: selectedService, date: value });
    }
  };

  const handleSlotSelect = (startAt: string) => {
    if (salonId) writeSelection(salonId, { serviceId: selectedService, date });
    navigate(`/salon/${salonId}/book/confirm`, {
      state: { serviceId: selectedService, startAt },
    });
  };

  // Map each free slot to a chip state. The API returns only free slots, so a
  // slot is `selected` when it is the chosen start, `past` when its start is
  // already behind us, and `available` otherwise. The grid supports held/full
  // too; those simply aren't expressible from this endpoint's contract.
  const now = Date.now();
  const slotItems: SlotItem[] = slots.map((slot) => {
    let state: SlotState = 'available';
    if (new Date(slot.startAt).getTime() < now) state = 'past';
    return { id: slot.startAt, label: slotLabel(slot.startAt), state };
  });

  const serviceOptions = services.map((service) => ({
    value: service.id,
    label: service.name,
    helperText: (
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          {t('booking.durationMinutes', { count: service.durationMinutes })}
        </span>
        <Money amountRial={service.priceRial} className="font-medium text-text" />
      </span>
    ),
  }));

  return (
    <div
      data-testid="availability-page"
      className="mx-auto flex w-full max-w-funnel flex-col gap-6 py-6"
    >
      <SeoHead title={t('seo.titles.availability')} />
      <h1 className="text-xl font-bold text-text">{t('booking.heading')}</h1>

      {/* Service selector — card radio list with loading / error / empty / ready. */}
      <section aria-labelledby="service-section-title" className="flex flex-col gap-3">
        <h2
          id="service-section-title"
          className="flex items-center gap-2 text-lg font-bold text-text"
        >
          <Scissors className="h-5 w-5" aria-hidden="true" />
          {t('booking.selectService')}
        </h2>

        {servicesStatus === 'loading' && (
          <div
            className="flex flex-col gap-2"
            role="status"
            aria-busy="true"
            aria-label={t('booking.servicesLoadingLabel')}
          >
            <Skeleton variant="rect" className="h-16" />
            <Skeleton variant="rect" className="h-16" />
            <Skeleton variant="rect" className="h-16" />
          </div>
        )}

        {servicesStatus === 'error' && (
          <ErrorState
            title={t('booking.servicesErrorTitle')}
            description={t('booking.servicesErrorBody')}
            retryLabel={t('common.retry')}
            onRetry={loadServices}
          />
        )}

        {servicesStatus === 'ready' && services.length === 0 && (
          <EmptyState
            icon={<Scissors className="h-8 w-8" />}
            title={t('booking.servicesEmptyTitle')}
            description={t('booking.servicesEmptyBody')}
          />
        )}

        {servicesStatus === 'ready' && services.length > 0 && (
          <RadioGroup
            label={t('booking.selectService')}
            labelHidden
            value={selectedService}
            onValueChange={handleServiceChange}
            options={serviceOptions}
          />
        )}
      </section>

      {/* Date — Jalali picker (bottom sheet on mobile), past dates disabled. */}
      <section aria-labelledby="date-section-title" className="flex flex-col gap-3">
        <h2
          id="date-section-title"
          className="flex items-center gap-2 text-lg font-bold text-text"
        >
          <CalendarClock className="h-5 w-5" aria-hidden="true" />
          {t('booking.selectDate')}
        </h2>
        <JalaliDatePicker
          label={t('booking.selectDate')}
          value={date || null}
          onChange={handleDateChange}
          min={minDate}
          placeholder={t('booking.datePlaceholder')}
          variant={isMobile ? 'sheet' : 'popover'}
        />
      </section>

      {/* Time slots — skeleton → empty → populated, with an explicit error+retry. */}
      <section aria-labelledby="time-section-title" className="flex flex-col gap-3">
        <h2
          id="time-section-title"
          className="flex items-center gap-2 text-lg font-bold text-text"
        >
          <Clock className="h-5 w-5" aria-hidden="true" />
          {t('booking.selectTime')}
        </h2>

        {slotsStatus === 'idle' && (
          <p className="text-sm text-muted">{t('booking.chooseDateFirst')}</p>
        )}

        {slotsStatus === 'loading' && (
          <div
            className="grid grid-cols-[repeat(auto-fill,minmax(5rem,1fr))] gap-2"
            role="status"
            aria-busy="true"
            aria-label={t('booking.slotsLoadingLabel')}
          >
            {Array.from({ length: 8 }).map((_, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <Skeleton key={i} variant="rect" className="h-11" />
            ))}
          </div>
        )}

        {slotsStatus === 'error' && (
          <ErrorState
            title={t('booking.slotsErrorTitle')}
            description={t('booking.slotsErrorBody')}
            retryLabel={t('common.retry')}
            onRetry={loadSlots}
          />
        )}

        {slotsStatus === 'ready' && slotItems.length === 0 && (
          <EmptyState
            icon={<CalendarClock className="h-8 w-8" />}
            title={t('booking.slotsEmptyTitle')}
          />
        )}

        {slotsStatus === 'ready' && slotItems.length > 0 && (
          <SlotGrid
            slots={slotItems}
            onSelect={handleSlotSelect}
            ariaLabel={t('booking.slotsGridLabel')}
          />
        )}
      </section>
    </div>
  );
}
