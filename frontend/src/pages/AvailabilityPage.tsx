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
  TextField,
  type ServiceCardItem,
} from '../components/ui';
import { gregorianToJalali, getJalaliMonthName, normalizeDigits } from '@salon/shared';
import { readSalonName } from '../utils/salonName';

/** A bookable service as returned by the salon services endpoint (unchanged contract). */
interface Service {
  id: string;
  name: string;
  durationMinutes: number;
  priceRial: number;
  durationMode?: 'fixed' | 'variable';
  minDurationMinutes?: number | null;
  maxDurationMinutes?: number | null;
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
  serviceIds?: string[];
  date: string;
  startAt?: string;
  /** Preferred stylist id; '' (or absent) means "any stylist". */
  staffId?: string;
  locationType?: 'salon' | 'customer';
  durationMinutes?: number;
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
    const serviceIds = Array.isArray(parsed.serviceIds)
      ? parsed.serviceIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : [];
    const serviceId =
      typeof parsed.serviceId === 'string' && parsed.serviceId.length > 0
        ? parsed.serviceId
        : serviceIds[0];
    if (!serviceId || typeof parsed.date !== 'string') {
      return null;
    }
    return {
      serviceId,
      serviceIds: [...new Set([serviceId, ...serviceIds])],
      date: parsed.date,
      startAt: typeof parsed.startAt === 'string' ? parsed.startAt : undefined,
      staffId: typeof parsed.staffId === 'string' ? parsed.staffId : undefined,
      locationType:
        parsed.locationType === 'salon' || parsed.locationType === 'customer'
          ? parsed.locationType
          : undefined,
      durationMinutes:
        typeof parsed.durationMinutes === 'number' && Number.isInteger(parsed.durationMinutes)
          ? parsed.durationMinutes
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
 * + day-of-month + month — starting at the policy's allowed lower bound. Each item's `iso` is a local
 * `YYYY-MM-DD` the availability API understands.
 */
function buildUpcomingDays(count: number, startISO = todayISO()): DayScrollerItem[] {
  const out: DayScrollerItem[] = [];
  const base = new Date(`${startISO}T00:00:00`);
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

/** Today as a `YYYY-MM-DD` local date — base date for booking-policy bounds. */
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
  const today = useMemo(() => todayISO(), []);
  const [bookingWindowDays, setBookingWindowDays] = useState(1);
  const [bookingStartOffsetDays, setBookingStartOffsetDays] = useState(0);
  const minDate = useMemo(
    () => addDaysISO(today, bookingStartOffsetDays),
    [bookingStartOffsetDays, today],
  );
  const maxDate = useMemo(
    () => addDaysISO(today, bookingWindowDays),
    [bookingWindowDays, today],
  );
  const [weekOffset, setWeekOffset] = useState(0);
  const upcomingDays = useMemo(
    () =>
      buildUpcomingDays(
        Math.min(
          7,
          Math.max(0, bookingWindowDays - bookingStartOffsetDays - weekOffset * 7 + 1),
        ),
        addDaysISO(minDate, weekOffset * 7),
      ),
    [bookingStartOffsetDays, bookingWindowDays, minDate, weekOffset],
  );

  // Restore any persisted selection so back-navigation keeps the user's place.
  const restored = useMemo(() => readSelection(salonId), [salonId]);
  // A stylist-scoped QR deep-links here with `?staff=<id>` so that stylist is
  // pre-selected; otherwise fall back to any persisted choice, else "any".
  const initialStaff = searchParams.get('staff') ?? restored?.staffId ?? '';

  const [services, setServices] = useState<Service[]>([]);
  const [servicesStatus, setServicesStatus] = useState<Status>('idle');
  const [selectedService, setSelectedService] = useState(restored?.serviceId ?? '');
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>(
    restored?.serviceIds?.length ? restored.serviceIds : restored?.serviceId ? [restored.serviceId] : [],
  );
  const [multiServiceSelection, setMultiServiceSelection] = useState(
    Boolean(restored?.serviceIds && restored.serviceIds.length > 1),
  );
  const [date, setDate] = useState(restored?.date ?? '');
  const [selectedStartAt, setSelectedStartAt] = useState(restored?.startAt ?? '');
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
  const [durationMinutes, setDurationMinutes] = useState(
    restored?.durationMinutes ? String(restored.durationMinutes) : '',
  );
  const [durationError, setDurationError] = useState('');
  const [workMode, setWorkMode] = useState<BookingWorkMode>('not_decided');
  // Do not use a stale sessionStorage date until the salon's current booking
  // policy has arrived. Otherwise a changed lower/upper bound can trigger a
  // guaranteed 400 from availability before the picker is corrected.
  const [bookingPolicyLoaded, setBookingPolicyLoaded] = useState(false);

  const selectedServiceDetails = useMemo(
    () => services.find((service) => service.id === selectedService),
    [services, selectedService],
  );
  const selectedServiceDetailsList = useMemo(
    () => selectedServiceIds.map((id) => services.find((service) => service.id === id)).filter(Boolean) as Service[],
    [services, selectedServiceIds],
  );
  const selectedTotalDuration = useMemo(() => {
    const variablePrimaryDuration = selectedServiceDetails?.durationMode === 'variable' && durationMinutes
      ? Number(durationMinutes)
      : undefined;
    return selectedServiceDetailsList.reduce((total, service, index) => {
      if (index === 0 && variablePrimaryDuration !== undefined) return total + variablePrimaryDuration;
      return total + (service.durationMode === 'variable'
        ? service.minDurationMinutes ?? service.durationMinutes
        : service.durationMinutes);
    }, 0);
  }, [durationMinutes, selectedServiceDetails, selectedServiceDetailsList]);

  const selectedDurationBounds = useMemo(() => {
    return selectedServiceDetailsList.reduce(
      (bounds, service, index) => {
        const min =
          service.durationMode === 'variable'
            ? service.minDurationMinutes ?? service.durationMinutes
            : service.durationMinutes;
        const max =
          service.durationMode === 'variable'
            ? service.maxDurationMinutes ?? service.durationMinutes
            : service.durationMinutes;
        return { min: bounds.min + min, max: bounds.max + max };
      },
      { min: 0, max: 0 },
    );
  }, [durationMinutes, selectedServiceDetailsList]);

  useEffect(() => {
    if (selectedServiceDetails?.durationMode !== 'variable') {
      setDurationMinutes('');
      setDurationError('');
      return;
    }
    const min = selectedServiceDetails.minDurationMinutes ?? selectedServiceDetails.durationMinutes;
    const max = selectedServiceDetails.maxDurationMinutes ?? min;
    setDurationMinutes((current) => {
      const parsed = Number(current);
      return Number.isInteger(parsed) && parsed >= min && parsed <= max ? current : String(min);
    });
    setDurationError('');
  }, [selectedServiceDetails]);

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
          const next = currentIsValid ? current : (res.services[0]?.id ?? '');
          setSelectedServiceIds((ids) => {
            const valid = ids.filter((id) => res.services.some((service) => service.id === id));
            return valid.length > 0 ? valid : next ? [next] : [];
          });
          return next;
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
    if (!salonId || typeof salonApi.getBookingPolicy !== 'function') {
      // Older API deployments do not expose this optional endpoint. Preserve
      // their legacy availability behavior instead of discarding a valid
      // deep-link/session selection.
      setBookingPolicyLoaded(true);
      return;
    }
    let active = true;
    setBookingPolicyLoaded(false);
    salonApi
      .getBookingPolicy(salonId)
      .then(
        ({
          bookingWindowDays: value,
          bookingStartOffsetDays: startOffset = 0,
          workMode: mode,
          locationTypes: supported,
        }) => {
          setBookingWindowDays(value);
          setBookingStartOffsetDays(startOffset);
          if (mode) setWorkMode(mode);
          const nextTypes =
            supported?.filter((item): item is 'salon' | 'customer' =>
              item === 'salon' || item === 'customer',
            ) ?? ['salon'];
          setLocationTypes(nextTypes.length > 0 ? nextTypes : ['salon']);
          setLocationType((current) =>
            nextTypes.includes(current) ? current : (nextTypes[0] ?? 'salon'),
          );
          const upperBound = addDaysISO(today, value);
          const lowerBound = addDaysISO(today, startOffset);
          setDate((current) =>
            current && current >= lowerBound && current <= upperBound ? current : '',
          );
          setWeekOffset(0);
        },
      )
      .catch(() => {
        // Keep the safe defaults when an older deployment has no policy route,
        // but never replay a persisted date outside that fallback range.
        if (!active) return;
        const fallbackUpperBound = addDaysISO(today, 1);
        setDate((current) =>
          current && current >= today && current <= fallbackUpperBound ? current : '',
        );
      })
      .finally(() => {
        if (active) setBookingPolicyLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [salonId, today]);

  // Load availability whenever selected services + date are both chosen. The
  // API returns only starts that fit the whole appointment duration.
  const loadSlots = useCallback(() => {
    if (!bookingPolicyLoaded || !salonId || !selectedService || !date) {
      setSlotsStatus('idle');
      setSlots([]);
      return;
    }
    const requestedDuration =
      selectedServiceDetails?.durationMode === 'variable' && durationMinutes
        ? selectedTotalDuration
        : undefined;
    if (
      selectedServiceDetails?.durationMode === 'variable' &&
      (requestedDuration === undefined ||
        !Number.isInteger(requestedDuration) ||
        requestedDuration < selectedDurationBounds.min ||
        requestedDuration > selectedDurationBounds.max)
    ) {
      setSlots([]);
      setSlotsStatus('idle');
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
        requestedDuration,
        selectedServiceIds,
      )
      .then((res) => {
        setSlots(res.slots);
        setSlotsStatus('ready');
      })
      .catch(() => setSlotsStatus('error'));
  }, [
    salonId,
    selectedService,
    selectedServiceDetails,
    selectedDurationBounds,
    selectedTotalDuration,
    selectedServiceIds,
    date,
    selectedStaff,
    locationType,
    durationMinutes,
    bookingPolicyLoaded,
  ]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  const serviceLocationLabel =
    workMode === 'rented_chair'
      ? t('booking.locationRentedChair', { defaultValue: 'در محل کار عضو تیم' })
      : workMode === 'home'
        ? t('booking.locationHome', { defaultValue: 'در محل کار عضو تیم' })
        : workMode === 'fixed_salon'
          ? t('booking.locationSalon', { defaultValue: 'در سالن' })
          : t('booking.locationServicePlace', { defaultValue: 'در محل ارائه خدمت' });
  const serviceLocationHint =
    workMode === 'rented_chair'
      ? t('booking.locationRentedChairHint', {
          defaultValue: 'رزرو در جایگاه ثابت عضو تیم انجام می‌شود.',
        })
      : workMode === 'home'
        ? t('booking.locationHomeHint', {
            defaultValue: 'خدمات در محل کار عضو تیم انجام می‌شود.',
          })
        : t('booking.locationSalonHint', {
            defaultValue: 'خدمات در محل ثابت سالن انجام می‌شود.',
          });

  const persistSelection = (patch: Partial<PersistedSelection> = {}) => {
    if (!salonId) return;
    const serviceIds = patch.serviceIds ?? selectedServiceIds;
    const serviceId = patch.serviceId ?? serviceIds[0] ?? selectedService;
    if (!serviceId || !(patch.date ?? date)) return;
    const startAt = Object.prototype.hasOwnProperty.call(patch, 'startAt')
      ? patch.startAt
      : selectedStartAt;
    writeSelection(salonId, {
      serviceId,
      serviceIds: [...new Set([serviceId, ...serviceIds])],
      date: patch.date ?? date,
      staffId: patch.staffId ?? selectedStaff,
      locationType: patch.locationType ?? locationType,
      durationMinutes: patch.durationMinutes ?? (durationMinutes ? Number(durationMinutes) : undefined),
      startAt: startAt || undefined,
    });
  };

  const handleServiceSelection = (values: string[]) => {
    const nextIds = [...new Set(values)];
    const nextService = services.find((service) => service.id === nextIds[0]);
    setSelectedServiceIds(nextIds);
    setSelectedService(nextIds[0] ?? '');
    setDurationMinutes(
      nextService?.durationMode === 'variable'
        ? String(nextService.minDurationMinutes ?? nextService.durationMinutes)
        : '',
    );
    setSelectedStartAt('');
    setDurationError('');
    persistSelection({
      serviceId: nextIds[0] ?? '',
      serviceIds: nextIds,
      startAt: undefined,
      durationMinutes:
        nextService?.durationMode === 'variable'
          ? nextService.minDurationMinutes ?? nextService.durationMinutes
          : undefined,
    });
  };

  const handleServiceChange = (value: string) => handleServiceSelection([value]);

  const handleDateChange = (value: string) => {
    setDate(value);
    setSelectedStartAt('');
    persistSelection({ date: value, startAt: undefined });
  };

  const handleStaffChange = (value: string) => {
    setSelectedStaff(value);
    persistSelection({ staffId: value });
  };

  const handleLocationChange = (value: string) => {
    if (value !== 'salon' && value !== 'customer') return;
    setLocationType(value);
    persistSelection({ locationType: value });
  };

  const handleSlotSelect = (startAt: string) => {
    setSelectedStartAt(startAt);
    persistSelection({ startAt });
    navigate(`/salon/${salonId}/book/confirm`, {
      state: {
        serviceId: selectedService,
        serviceIds: selectedServiceIds,
        startAt,
        // Pass the stylist preference through to confirm → booking (omit when
        // "any" so the scheduler is free to assign).
        preferredStaffId: selectedStaff || undefined,
        locationType,
        durationMinutes: selectedServiceDetails?.durationMode === 'variable' && durationMinutes
          ? Number(durationMinutes)
          : undefined,
      },
    });
  };

  const handleJoinWaitlist = () => {
    if (!salonId || !selectedService || !date) return;
    const returnTo = `/salon/${salonId}/waitlist`;
    const returnState = { serviceId: selectedService, serviceIds: selectedServiceIds, date };
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
    if (slot.startAt === selectedStartAt) state = 'selected';
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
            <>
              <ServiceCardList
                services={serviceCardItems}
                value={selectedService}
                onValueChange={handleServiceChange}
                multiple={multiServiceSelection}
                values={selectedServiceIds}
                onValuesChange={handleServiceSelection}
                ariaLabel={t('booking.selectService')}
                durationLabel={(minutes) => t('booking.durationMinutes', { count: minutes })}
              />
              {services.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                  className="self-start"
                  onClick={() => {
                    setMultiServiceSelection((enabled) => {
                      if (enabled && selectedService) {
                        setSelectedServiceIds([selectedService]);
                        persistSelection({ serviceIds: [selectedService] });
                      }
                      return !enabled;
                    });
                  }}
                >
                  {multiServiceSelection ? 'انتخاب یک خدمت' : 'انتخاب همزمان چند خدمت'}
                </Button>
              )}
            </>
          )}
        </section>

        {selectedServiceDetails?.durationMode === 'variable' && (
          <section
            aria-labelledby="duration-section-title"
            className="flex flex-col gap-3 rounded-lg border border-border bg-elevated p-4 shadow-2 sm:p-5"
          >
            <h2 id="duration-section-title" className="text-base font-bold text-text">
              مدت موردنیاز
            </h2>
            <p className="m-0 text-sm text-muted">
              برای نمایش زمان‌های واقعی، مدت این نوبت را انتخاب کن.
            </p>
            <TextField
              label="مدت نوبت (دقیقه)"
              value={durationMinutes}
              onChange={(event) => {
                const next = normalizeDigits(event.target.value).replace(/\D/g, '');
                setDurationMinutes(next);
                const min = selectedServiceDetails.minDurationMinutes ?? selectedServiceDetails.durationMinutes;
                const max = selectedServiceDetails.maxDurationMinutes ?? min;
                const parsed = Number(next);
                setDurationError(
                  !Number.isInteger(parsed) || parsed < min || parsed > max
                    ? `مدت باید بین ${min} تا ${max} دقیقه باشد.`
                    : '',
                );
              }}
              inputMode="numeric"
              dir="ltr"
              error={durationError}
              helperText={!durationError ? `بین ${selectedServiceDetails.minDurationMinutes ?? selectedServiceDetails.durationMinutes} تا ${selectedServiceDetails.maxDurationMinutes ?? selectedServiceDetails.durationMinutes} دقیقه` : undefined}
            />
          </section>
        )}

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
                    defaultValue: 'عضو تیم به آدرس شما مراجعه می‌کند.',
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
              defaultValue: 'عضو تیم به آدرس شما مراجعه می‌کند.',
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
            {t('booking.bookingDate', { defaultValue: 'تاریخ رزرو' })}
          </h2>
          <DayScroller
            days={upcomingDays}
            value={date || null}
            onChange={handleDateChange}
            label={t('booking.nearbyDates', { defaultValue: 'روزهای نزدیک' })}
          />
          <div
            className="flex items-center justify-between gap-2"
            aria-label={t('booking.changeWeek', { defaultValue: 'تغییر هفته' })}
          >
            <Button
              type="button"
              variant="ghost"
              size="md"
              disabled={weekOffset === 0}
              onClick={() => setWeekOffset((current) => Math.max(0, current - 1))}
            >
              هفته قبل
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="md"
              disabled={
                weekOffset >=
                Math.max(0, Math.ceil((bookingWindowDays - bookingStartOffsetDays + 1) / 7) - 1)
              }
              onClick={() =>
                setWeekOffset((current) =>
                  Math.min(
                    Math.max(
                      0,
                      Math.ceil((bookingWindowDays - bookingStartOffsetDays + 1) / 7) - 1,
                    ),
                    current + 1,
                  ),
                )
              }
            >
              هفته بعد
            </Button>
          </div>
          <JalaliDatePicker
            label={t('booking.chooseAnotherDate', { defaultValue: 'انتخاب تاریخ دیگر' })}
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
