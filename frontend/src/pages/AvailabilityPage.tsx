import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarClock, Clock, MapPin, Scissors, Users } from 'lucide-react';
import { getAccessToken, salonApi } from '../api/client';
import { SeoHead } from '../components/seo';
import { FunnelShell } from '../components/layout';
import {
  DayScroller,
  type DayScrollerItem,
  EmptyState,
  ErrorState,
  JalaliDatePicker,
  RadioGroup,
  Skeleton,
  SlotGrid,
  type SlotItem,
  type SlotState,
  ServiceCardList,
  Button,
  type ServiceCardItem,
} from '../components/ui';
import { gregorianToJalali, getJalaliMonthName } from '@salon/shared';
import { readSalonName } from '../utils/salonName';

/** A bookable service as returned by the salon services endpoint (unchanged contract). */
interface Service {
  id: string;
  name: string;
  durationMinutes: number;
  priceRial: number;
}

/** A bookable stylist as returned by the public stylists endpoint. */
interface Stylist {
  id: string;
  fullName: string | null;
  role: string;
}

/** A free time slot as returned by the availability endpoint (unchanged contract). */
interface Slot {
  startAt: string;
  endAt: string;
}

/** A simple async-resource status used by the service list and the slot grid. */
type Status = 'idle' | 'loading' | 'error' | 'ready';
type BookingWorkMode =
  | 'fixed_salon'
  | 'rented_chair'
  | 'home'
  | 'mobile'
  | 'hybrid'
  | 'not_decided';

/**
 * Persisted funnel selection so a customer who advances to confirm and then
 * navigates **back** lands on the availability step with their service, date,
 * and chosen stylist still selected (ui-ux §8 "back returns without losing
 * state"). Scoped per salon in `sessionStorage` so it never bleeds across
 * salons or survives the session.
 */
interface PersistedSelection {
  serviceId: string;
  date: string;
  /** Preferred stylist id; '' (or absent) means "any stylist". */
  staffId?: string;
  locationType?: 'salon' | 'customer';
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
    return {
      serviceId: parsed.serviceId,
      date: parsed.date,
      staffId: typeof parsed.staffId === 'string' ? parsed.staffId : undefined,
      locationType:
        parsed.locationType === 'salon' || parsed.locationType === 'customer'
          ? parsed.locationType
          : undefined,
    };
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

/** Persian weekday short labels (Saturday-first to match the Iranian week). */
const PERSIAN_WEEKDAY_SHORT: Record<number, string> = {
  0: 'یک',
  1: 'دو',
  2: 'سه',
  3: 'چهار',
  4: 'پنج',
  5: 'جمعه',
  6: 'شنبه',
};

/**
 * Builds the next `count` days as Booksy-style scroller items — Persian weekday
 * + day-of-month + month — starting today. Each item's `iso` is a local
 * `YYYY-MM-DD` the availability API understands.
 */
function buildUpcomingDays(count: number): DayScrollerItem[] {
  const out: DayScrollerItem[] = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let i = 0; i < count; i += 1) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`;
    const j = gregorianToJalali({
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      day: d.getDate(),
    });
    out.push({
      iso,
      weekday: PERSIAN_WEEKDAY_SHORT[d.getDay()],
      day: j.jd,
      month: getJalaliMonthName(j.jm),
      hasSlots: true,
      disabled: false,
    });
  }
  return out;
}

/** Today as a `YYYY-MM-DD` local date — the inclusive lower bound for the picker. */
function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDaysISO(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + days);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(
    value.getDate(),
  ).padStart(2, '0')}`;
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
  const [searchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const minDate = useMemo(() => todayISO(), []);
  const [bookingWindowDays, setBookingWindowDays] = useState(14);
  const maxDate = useMemo(
    () => addDaysISO(minDate, bookingWindowDays),
    [minDate, bookingWindowDays],
  );
  const upcomingDays = useMemo(
    () => buildUpcomingDays(Math.min(bookingWindowDays + 1, 31)),
    [bookingWindowDays],
  );

  // Restore any persisted selection so back-navigation keeps the user's place.
  const restored = useMemo(() => readSelection(salonId), [salonId]);
  // A stylist-scoped QR deep-links here with `?staff=<id>` so that stylist is
  // pre-selected; otherwise fall back to any persisted choice, else "any".
  const initialStaff = searchParams.get('staff') ?? restored?.staffId ?? '';

  const [services, setServices] = useState<Service[]>([]);
  const [servicesStatus, setServicesStatus] = useState<Status>('idle');
  const [selectedService, setSelectedService] = useState(restored?.serviceId ?? '');
  const [date, setDate] = useState(restored?.date ?? '');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsStatus, setSlotsStatus] = useState<Status>('idle');
  // Stylist picker: '' means "any stylist" (the default). A specific id is a
  // soft preference passed to booking as `preferredStaffId`.
  const [stylists, setStylists] = useState<Stylist[]>([]);
  const [stylistsStatus, setStylistsStatus] = useState<Status>('idle');
  const [selectedStaff, setSelectedStaff] = useState(initialStaff);
  const [locationTypes, setLocationTypes] = useState<Array<'salon' | 'customer'>>(['salon']);
  const [locationType, setLocationType] = useState<'salon' | 'customer'>(
    restored?.locationType ?? 'salon',
  );
  const [workMode, setWorkMode] = useState<BookingWorkMode>('not_decided');

  // Load the salon's services (with loading + error states).
  const loadServices = useCallback(() => {
    if (!salonId) return;
    setServicesStatus('loading');
    salonApi
      .getServices(salonId)
      .then((res) => {
        setServices(res.services);
        setSelectedService((current) => {
          const currentIsValid =
            current.length > 0 && res.services.some((service) => service.id === current);
          return currentIsValid ? current : (res.services[0]?.id ?? '');
        });
        setServicesStatus('ready');
      })
      .catch(() => setServicesStatus('error'));
  }, [salonId]);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  // Load the salon's bookable stylists for the picker. Best-effort: a failure
  // simply omits the picker so booking still works with "any stylist".
  const loadStylists = useCallback(() => {
    if (!salonId) return;
    setStylistsStatus('loading');
    salonApi
      .getStylists(salonId)
      .then((res) => {
        setStylists(res.stylists);
        setStylistsStatus('ready');
      })
      .catch(() => setStylistsStatus('error'));
  }, [salonId]);

  useEffect(() => {
    loadStylists();
  }, [loadStylists]);

  useEffect(() => {
    if (!salonId || typeof salonApi.getBookingPolicy !== 'function') return;
    salonApi
      .getBookingPolicy(salonId)
      .then(({ bookingWindowDays: value, workMode: mode, locationTypes: supported }) => {
        setBookingWindowDays(value);
        if (mode) setWorkMode(mode);
        const nextTypes =
          supported?.filter((item): item is 'salon' | 'customer' =>
            item === 'salon' || item === 'customer',
          ) ?? ['salon'];
        setLocationTypes(nextTypes.length > 0 ? nextTypes : ['salon']);
        setLocationType((current) =>
          nextTypes.includes(current) ? current : (nextTypes[0] ?? 'salon'),
        );
        const upperBound = addDaysISO(minDate, value);
        setDate((current) => (current && current <= upperBound ? current : ''));
      })
      .catch(() => undefined);
  }, [salonId, minDate]);

  // Load availability whenever a service + date are both chosen.
  const loadSlots = useCallback(() => {
    if (!salonId || !selectedService || !date) {
      setSlotsStatus('idle');
      setSlots([]);
      return;
    }
    setSlotsStatus('loading');
    salonApi
      .getAvailability(
        salonId,
        selectedService,
        date,
        selectedStaff || undefined,
        locationType,
      )
      .then((res) => {
        setSlots(res.slots);
        setSlotsStatus('ready');
      })
      .catch(() => setSlotsStatus('error'));
  }, [salonId, selectedService, date, selectedStaff, locationType]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  const serviceLocationLabel =
    workMode === 'rented_chair'
      ? t('booking.locationRentedChair', { defaultValue: 'در محل کار آرایشگر' })
      : workMode === 'home'
        ? t('booking.locationHome', { defaultValue: 'در محل کار آرایشگر' })
        : workMode === 'fixed_salon'
          ? t('booking.locationSalon', { defaultValue: 'در سالن' })
          : t('booking.locationServicePlace', { defaultValue: 'در محل ارائه خدمت' });
  const serviceLocationHint =
    workMode === 'rented_chair'
      ? t('booking.locationRentedChairHint', {
          defaultValue: 'رزرو در جایگاه ثابت آرایشگر انجام می‌شود.',
        })
      : workMode === 'home'
        ? t('booking.locationHomeHint', {
            defaultValue: 'خدمات در محل کار آرایشگر انجام می‌شود.',
          })
        : t('booking.locationSalonHint', {
            defaultValue: 'خدمات در محل ثابت سالن انجام می‌شود.',
          });

  const handleServiceChange = (value: string) => {
    setSelectedService(value);
    if (salonId && date) {
      writeSelection(salonId, { serviceId: value, date, staffId: selectedStaff, locationType });
    }
  };

  const handleDateChange = (value: string) => {
    setDate(value);
    if (salonId && selectedService) {
      writeSelection(salonId, {
        serviceId: selectedService,
        date: value,
        staffId: selectedStaff,
        locationType,
      });
    }
  };

  const handleStaffChange = (value: string) => {
    setSelectedStaff(value);
    if (salonId && selectedService && date) {
      writeSelection(salonId, {
        serviceId: selectedService,
        date,
        staffId: value,
        locationType,
      });
    }
  };

  const handleLocationChange = (value: string) => {
    if (value !== 'salon' && value !== 'customer') return;
    setLocationType(value);
    if (salonId && selectedService && date) {
      writeSelection(salonId, {
        serviceId: selectedService,
        date,
        staffId: selectedStaff,
        locationType: value,
      });
    }
  };

  const handleSlotSelect = (startAt: string) => {
    if (salonId) {
      writeSelection(salonId, {
        serviceId: selectedService,
        date,
        staffId: selectedStaff,
        locationType,
      });
    }
    navigate(`/salon/${salonId}/book/confirm`, {
      state: {
        serviceId: selectedService,
        startAt,
        // Pass the stylist preference through to confirm → booking (omit when
        // "any" so the scheduler is free to assign).
        preferredStaffId: selectedStaff || undefined,
        locationType,
      },
    });
  };

  const handleJoinWaitlist = () => {
    if (!salonId || !selectedService || !date) return;
    const returnTo = `/salon/${salonId}/waitlist`;
    const returnState = { serviceId: selectedService, date };
    if (getAccessToken()) {
      navigate(returnTo, { state: returnState });
      return;
    }
    navigate('/auth', { state: { returnTo, returnState } });
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

  // Compute the stepper's active step index based on user progress:
  // 0 = selecting service, 1 = selecting date, 2 = selecting time slot.
  const activeStep = !selectedService ? 0 : !date ? 1 : 2;

  // Map services to ServiceCardItem for the Booksy-style card list
  const serviceCardItems: ServiceCardItem[] = services.map((service) => ({
    id: service.id,
    name: service.name,
    durationMinutes: service.durationMinutes,
    priceRial: service.priceRial,
  }));

  // Stylist options: an explicit "any stylist" choice first (sentinel `any` so
  // the radio value is never empty), then each bookable stylist by name.
  const stylistOptions = [
    { value: 'any', label: t('booking.anyStylist'), helperText: t('booking.anyStylistHint') },
    ...stylists.map((s) => ({
      value: s.id,
      label: s.fullName ?? t('booking.stylistFallback'),
    })),
  ];

  return (
    <FunnelShell
      currentStep={activeStep === 0 ? 'service' : activeStep === 1 ? 'date' : 'time'}
      salonName={readSalonName(salonId) ?? undefined}
    >
      <div data-testid="availability-page" className="flex w-full flex-col gap-8">
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
            <ServiceCardList
              services={serviceCardItems}
              value={selectedService}
              onValueChange={handleServiceChange}
              ariaLabel={t('booking.selectService')}
              durationLabel={(minutes) => t('booking.durationMinutes', { count: minutes })}
            />
          )}
        </section>

        {/* Stylist picker — appears after a salon QR scan so the customer can
          choose their stylist (or "any"). A stylist-scoped QR pre-selects one.
          Best-effort: hidden while loading fails or no stylists exist. */}
        {(stylistsStatus === 'loading' || (stylistsStatus === 'ready' && stylists.length > 0)) && (
          <section aria-labelledby="stylist-section-title" className="flex flex-col gap-3">
            <h2
              id="stylist-section-title"
              className="flex items-center gap-2 text-lg font-bold text-text"
            >
              <Users className="h-5 w-5" aria-hidden="true" />
              {t('booking.selectStylist')}
            </h2>

            {stylistsStatus === 'loading' && (
              <div
                className="flex flex-col gap-2"
                role="status"
                aria-busy="true"
                aria-label={t('booking.stylistsLoadingLabel')}
              >
                <Skeleton variant="rect" className="h-11" />
                <Skeleton variant="rect" className="h-11" />
              </div>
            )}

            {stylistsStatus === 'ready' && stylists.length > 0 && (
              <RadioGroup
                label={t('booking.selectStylist')}
                labelHidden
                value={selectedStaff === '' ? 'any' : selectedStaff}
                onValueChange={(v) => handleStaffChange(v === 'any' ? '' : v)}
                options={stylistOptions}
              />
            )}
          </section>
        )}

        {locationTypes.length > 1 && (
          <section aria-labelledby="location-section-title" className="flex flex-col gap-3">
            <h2
              id="location-section-title"
              className="flex items-center gap-2 text-lg font-bold text-text"
            >
              <MapPin className="h-5 w-5" aria-hidden="true" />
              {t('booking.selectLocation', { defaultValue: 'محل انجام خدمات' })}
            </h2>
            <RadioGroup
              label={t('booking.selectLocation', { defaultValue: 'محل انجام خدمات' })}
              labelHidden
              value={locationType}
              onValueChange={handleLocationChange}
              options={[
                {
                  value: 'salon',
                  label: serviceLocationLabel,
                  helperText: serviceLocationHint,
                },
                {
                  value: 'customer',
                  label: t('booking.locationCustomer', { defaultValue: 'در محل شما' }),
                  helperText: t('booking.locationCustomerHint', {
                    defaultValue: 'آرایشگر به آدرس شما مراجعه می‌کند.',
                  }),
                },
              ]}
            />
          </section>
        )}

        {locationTypes.length === 1 && locationType === 'customer' && (
          <p className="flex items-center gap-2 rounded-lg border border-brand/30 bg-brand/5 px-3 py-2 text-sm text-text">
            <MapPin className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
            {t('booking.locationCustomerHint', {
              defaultValue: 'آرایشگر به آدرس شما مراجعه می‌کند.',
            })}
          </p>
        )}

        {/* Date — the salon's configured booking horizon, enforced here and server-side. */}
        <section aria-labelledby="date-section-title" className="flex flex-col gap-3">
          <h2
            id="date-section-title"
            className="flex items-center gap-2 text-lg font-bold text-text"
          >
            <CalendarClock className="h-5 w-5" aria-hidden="true" />
            {t('booking.selectDate')}
          </h2>
          <DayScroller
            days={upcomingDays}
            value={date || null}
            onChange={handleDateChange}
            label={t('booking.selectDate')}
          />
          <JalaliDatePicker
            label={t('booking.selectDate')}
            value={date || null}
            onChange={handleDateChange}
            min={minDate}
            max={maxDate}
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
              description={t('booking.slotsEmptyBody')}
              action={
                selectedService && date ? (
                  <Button variant="secondary" onClick={handleJoinWaitlist}>
                    {t('booking.joinWaitlist')}
                  </Button>
                ) : undefined
              }
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
    </FunnelShell>
  );
}
