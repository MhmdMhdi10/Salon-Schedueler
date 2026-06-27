import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  gregorianToJalali,
  jalaliToGregorian,
  getJalaliMonthName,
  toPersianDigits,
  type GregorianDate,
} from '@salon/shared';
import {
  loadServices,
  loadSlots,
  createBooking,
  type Service,
  type Slot,
} from './AvailabilityScreen.logic';
import { useTheme } from '../theme';
import type { RnTheme } from '../theme';

/**
 * Availability/booking screen (React Native), built to the shared design
 * language (R6.4; ui-ux Availability recipe, §6 states, §11 RTL/Jalali) and
 * kept consistent with the web booking funnel (`AvailabilityPage.tsx`).
 *
 * This was previously a stub that only exported the route-name constant; the
 * `AVAILABILITY_SCREEN` export is preserved so existing references stay valid.
 *
 * The screen is the funnel core and composes three sections, each carrying the
 * full data-state set (skeleton → empty → error+retry → populated, ui-ux §6):
 *
 *  - **Service selector** — a card list, each showing the service name, its
 *    duration, and its **Rial price** (Persian digits, grouped). Loading shows
 *    layout-matched skeleton cards; error offers retry; empty explains why.
 *  - **Jalali date picker** — a Persian-calendar month grid (Persian month
 *    names + digits, Saturday-first Iranian week) replacing any native date
 *    input. Gregorian↔Jalali conversion reuses the shared utilities; ISO
 *    (`YYYY-MM-DD`) is used only at the API boundary (R7.2, R7.8).
 *  - **Slot chip grid** — slot chips with the interactive-state set; skeleton
 *    chips while loading → empty card → populated chips, distinguishable
 *    without color (R2.6).
 *
 * Selecting a slot opens a **summary + confirm** surface with a primary
 * «تایید رزرو» CTA whose states are idle → loading → explicit
 * **payment-redirect** (for a held booking) → success, plus an error+retry.
 * The booking flow lives in `AvailabilityScreen.logic.ts` and uses the shared
 * API client unchanged — money is confirmed by the server, never faked.
 *
 * All copy comes from the mobile i18n catalog (`booking.* / common.*`); Persian
 * typography, display digits, and RTL layout come from the theme baseline.
 *
 * Requirement: 6.4, 7.2, 7.5
 */

/** Navigation route name for the availability screen. */
export const AVAILABILITY_SCREEN = 'AvailabilityScreen';

/** A simple async-resource status used by the service list and the slot grid. */
type Status = 'idle' | 'loading' | 'error' | 'ready';

/** Booking confirmation flow status. */
type BookingStatus = 'idle' | 'loading' | 'redirecting' | 'success' | 'error';

/** Formats a Rial amount with thousands grouping and Persian digits (R7.5). */
function formatRial(amount: number): string {
  const grouped = Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
  return toPersianDigits(grouped);
}

/** Iranian week order (Saturday first) as JS `Date.getDay()` indices. */
const WEEKDAY_ORDER = [6, 0, 1, 2, 3, 4, 5];
const WEEKDAY_LABELS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

/** Builds a `YYYY-MM-DD` ISO date string from Gregorian components. */
function toISODate(g: GregorianDate): string {
  return `${g.year}-${String(g.month).padStart(2, '0')}-${String(g.day).padStart(2, '0')}`;
}

/** Today's Gregorian date (local), used as the picker's inclusive lower bound. */
function today(): GregorianDate {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

/** Number of days in a Jalali month (1–6 → 31, 7–11 → 30, 12 → 29/30 leap). */
function jalaliMonthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  // Esfand: 30 in a leap year, else 29. Derive via conversion of day 30.
  const greg = jalaliToGregorian({ jy, jm: 12, jd: 30 });
  const back = gregorianToJalali(greg);
  return back.jm === 12 && back.jd === 30 ? 30 : 29;
}

/** `HH:mm` label for a slot's ISO start instant; digits localized for display. */
function slotLabel(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return toPersianDigits(`${hh}:${mm}`);
}

/** A full Jalali display label for the confirm summary, e.g. «۱۷ اردیبهشت ۱۴۰۴». */
function jalaliLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const j = gregorianToJalali({ year: y, month: m, day: d });
  return `${toPersianDigits(j.jd)} ${getJalaliMonthName(j.jm)} ${toPersianDigits(j.jy)}`;
}

export interface AvailabilityScreenProps {
  /** Salon whose services/availability are shown (resolved upstream from QR). */
  salonId: string;
  /** Called when a held booking needs the gateway; host performs the redirect. */
  onPaymentRedirect?: (url: string) => void;
  /** Called after a booking is confirmed, so the host can navigate onward. */
  onBooked?: () => void;
}

export function AvailabilityScreen({
  salonId,
  onPaymentRedirect,
  onBooked,
}: AvailabilityScreenProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const minDate = useMemo(() => today(), []);

  const [services, setServices] = useState<Service[]>([]);
  const [servicesStatus, setServicesStatus] = useState<Status>('idle');
  const [selectedService, setSelectedService] = useState('');
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsStatus, setSlotsStatus] = useState<Status>('idle');
  const [selectedSlot, setSelectedSlot] = useState('');

  const [bookingStatus, setBookingStatus] = useState<BookingStatus>('idle');
  const [bookingError, setBookingError] = useState('');

  // Jalali picker view month (defaults to the current Jalali month).
  const initialJalali = useMemo(() => gregorianToJalali(minDate), [minDate]);
  const [viewJy, setViewJy] = useState(initialJalali.jy);
  const [viewJm, setViewJm] = useState(initialJalali.jm);

  // --- Services -----------------------------------------------------------
  const fetchServices = useCallback(async () => {
    setServicesStatus('loading');
    const result = await loadServices(salonId);
    if (result.ok) {
      setServices(result.services);
      setServicesStatus('ready');
    } else {
      setServicesStatus('error');
    }
  }, [salonId]);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  // --- Slots --------------------------------------------------------------
  const fetchSlots = useCallback(async () => {
    if (!selectedService || !date) {
      setSlotsStatus('idle');
      setSlots([]);
      return;
    }
    setSlotsStatus('loading');
    const result = await loadSlots(salonId, selectedService, date);
    if (result.ok) {
      setSlots(result.slots);
      setSlotsStatus('ready');
    } else {
      setSlotsStatus('error');
    }
  }, [salonId, selectedService, date]);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  const handleSelectService = (id: string) => {
    setSelectedService(id);
    setSelectedSlot('');
    setBookingStatus('idle');
  };

  const handleSelectDate = (iso: string) => {
    setDate(iso);
    setSelectedSlot('');
    setBookingStatus('idle');
  };

  const handleSelectSlot = (startAt: string) => {
    setSelectedSlot(startAt);
    setBookingStatus('idle');
    setBookingError('');
  };

  const handleConfirm = async () => {
    if (!selectedSlot || bookingStatus === 'loading') return;
    setBookingStatus('loading');
    setBookingError('');
    const result = await createBooking({
      salonId,
      serviceId: selectedService,
      startAt: selectedSlot,
    });
    if (!result.ok) {
      setBookingError(result.error || t('booking.failedBody'));
      setBookingStatus('error');
      return;
    }
    if (result.status === 'held') {
      setBookingStatus('redirecting');
      onPaymentRedirect?.(result.paymentRedirectUrl);
      return;
    }
    setBookingStatus('success');
    onBooked?.();
  };

  // Month grid: leading blanks for the Saturday-first week, then each day.
  const monthDays = useMemo(() => {
    const length = jalaliMonthLength(viewJy, viewJm);
    const firstGreg = jalaliToGregorian({ jy: viewJy, jm: viewJm, jd: 1 });
    const firstWeekday = new Date(
      firstGreg.year,
      firstGreg.month - 1,
      firstGreg.day
    ).getDay();
    const lead = WEEKDAY_ORDER.indexOf(firstWeekday);
    const cells: Array<{ jd: number; iso: string; disabled: boolean } | null> = [];
    for (let i = 0; i < lead; i += 1) cells.push(null);
    const minIso = toISODate(minDate);
    for (let jd = 1; jd <= length; jd += 1) {
      const iso = toISODate(jalaliToGregorian({ jy: viewJy, jm: viewJm, jd }));
      cells.push({ jd, iso, disabled: iso < minIso });
    }
    return cells;
  }, [viewJy, viewJm, minDate]);

  const goPrevMonth = () => {
    if (viewJm === 1) {
      setViewJm(12);
      setViewJy((y) => y - 1);
    } else {
      setViewJm((m) => m - 1);
    }
  };
  const goNextMonth = () => {
    if (viewJm === 12) {
      setViewJm(1);
      setViewJy((y) => y + 1);
    } else {
      setViewJm((m) => m + 1);
    }
  };

  const selectedServiceObj = services.find((s) => s.id === selectedService);

  return (
    <View testID="availability-screen" style={styles.screen}>
      <Text style={styles.title} accessibilityRole="header">
        {t('booking.heading')}
      </Text>

      {/* Step indicator (۱ خدمت · ۲ تاریخ · ۳ زمان · ۴ تایید). */}
      <View style={styles.stepper} accessibilityRole="summary">
        {[
          t('booking.stepService'),
          t('booking.stepDate'),
          t('booking.stepTime'),
          t('booking.stepConfirm'),
        ].map((label, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <View key={i} style={styles.step}>
            <Text style={styles.stepNum}>{toPersianDigits(i + 1)}</Text>
            <Text style={styles.stepLabel}>{label}</Text>
          </View>
        ))}
      </View>

      {/* ---- Service selector ---------------------------------------- */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('booking.selectService')}</Text>

        {servicesStatus === 'loading' ? (
          <View
            testID="services-loading"
            accessibilityRole="progressbar"
            accessibilityLabel={t('booking.servicesLoadingLabel')}
            style={styles.skeletonList}
          >
            {[0, 1, 2].map((i) => (
              <View key={i} style={styles.skeletonCard} />
            ))}
          </View>
        ) : null}

        {servicesStatus === 'error' ? (
          <View testID="services-error" style={styles.errorCard} accessibilityRole="alert">
            <Text style={styles.errorTitle}>{t('booking.servicesErrorTitle')}</Text>
            <Text style={styles.errorBody}>{t('booking.servicesErrorBody')}</Text>
            <Pressable
              testID="services-retry"
              accessibilityRole="button"
              onPress={fetchServices}
              style={styles.retryButton}
            >
              <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
            </Pressable>
          </View>
        ) : null}

        {servicesStatus === 'ready' && services.length === 0 ? (
          <View testID="services-empty" style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{t('booking.servicesEmptyTitle')}</Text>
            <Text style={styles.emptyBody}>{t('booking.servicesEmptyBody')}</Text>
          </View>
        ) : null}

        {servicesStatus === 'ready' && services.length > 0 ? (
          <View style={styles.serviceList}>
            {services.map((service) => {
              const active = service.id === selectedService;
              return (
                <Pressable
                  key={service.id}
                  testID={`service-${service.id}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  onPress={() => handleSelectService(service.id)}
                  style={({ pressed }: { pressed: boolean }) => [
                    styles.serviceCard,
                    active ? styles.serviceCardActive : null,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <Text style={styles.serviceName}>{service.name}</Text>
                  <View style={styles.serviceMeta}>
                    <Text style={styles.serviceMetaText}>
                      {t('booking.durationMinutes', {
                        count: service.durationMinutes,
                      })}
                    </Text>
                    <Text style={styles.servicePrice}>
                      {t('booking.priceRial', { amount: formatRial(service.priceRial) })}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>

      {/* ---- Jalali date picker -------------------------------------- */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('booking.selectDate')}</Text>
        <View testID="date-picker" style={styles.calendar}>
          <View style={styles.calendarHeader}>
            <Pressable
              testID="cal-prev"
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
              onPress={goPrevMonth}
              style={styles.calNav}
            >
              {/* Directional chevron points to the start (right in RTL). */}
              <Text style={styles.calNavText}>‹</Text>
            </Pressable>
            <Text style={styles.calMonthLabel}>
              {getJalaliMonthName(viewJm)} {toPersianDigits(viewJy)}
            </Text>
            <Pressable
              testID="cal-next"
              accessibilityRole="button"
              accessibilityLabel={t('booking.selectDate')}
              onPress={goNextMonth}
              style={styles.calNav}
            >
              <Text style={styles.calNavText}>›</Text>
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAY_LABELS.map((label, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <Text key={i} style={styles.weekday}>
                {label}
              </Text>
            ))}
          </View>

          <View style={styles.dayGrid}>
            {monthDays.map((cell, i) =>
              cell === null ? (
                // eslint-disable-next-line react/no-array-index-key
                <View key={`blank-${i}`} style={styles.dayCell} />
              ) : (
                <Pressable
                  key={cell.iso}
                  testID={`day-${cell.iso}`}
                  accessibilityRole="button"
                  accessibilityState={{
                    selected: cell.iso === date,
                    disabled: cell.disabled,
                  }}
                  disabled={cell.disabled}
                  onPress={() => handleSelectDate(cell.iso)}
                  style={({ pressed }: { pressed: boolean }) => [
                    styles.dayCell,
                    styles.dayCellDay,
                    cell.iso === date ? styles.dayCellActive : null,
                    cell.disabled ? styles.dayCellDisabled : null,
                    pressed && !cell.disabled ? styles.pressed : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayText,
                      cell.iso === date ? styles.dayTextActive : null,
                      cell.disabled ? styles.dayTextDisabled : null,
                    ]}
                  >
                    {toPersianDigits(cell.jd)}
                  </Text>
                </Pressable>
              )
            )}
          </View>
        </View>
      </View>

      {/* ---- Slot grid ----------------------------------------------- */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('booking.selectTime')}</Text>

        {slotsStatus === 'idle' ? (
          <Text style={styles.hint}>{t('booking.chooseDateFirst')}</Text>
        ) : null}

        {slotsStatus === 'loading' ? (
          <View
            testID="slots-loading"
            accessibilityRole="progressbar"
            accessibilityLabel={t('booking.slotsLoadingLabel')}
            style={styles.slotGrid}
          >
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <View key={i} style={[styles.slotChip, styles.skeletonChip]} />
            ))}
          </View>
        ) : null}

        {slotsStatus === 'error' ? (
          <View testID="slots-error" style={styles.errorCard} accessibilityRole="alert">
            <Text style={styles.errorTitle}>{t('booking.slotsErrorTitle')}</Text>
            <Text style={styles.errorBody}>{t('booking.slotsErrorBody')}</Text>
            <Pressable
              testID="slots-retry"
              accessibilityRole="button"
              onPress={fetchSlots}
              style={styles.retryButton}
            >
              <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
            </Pressable>
          </View>
        ) : null}

        {slotsStatus === 'ready' && slots.length === 0 ? (
          <View testID="slots-empty" style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{t('booking.slotsEmptyTitle')}</Text>
            <Text style={styles.emptyBody}>{t('booking.slotsEmptyBody')}</Text>
          </View>
        ) : null}

        {slotsStatus === 'ready' && slots.length > 0 ? (
          <View testID="slot-grid" style={styles.slotGrid}>
            {slots.map((slot) => {
              const active = slot.startAt === selectedSlot;
              const past = new Date(slot.startAt).getTime() < Date.now();
              return (
                <Pressable
                  key={slot.startAt}
                  testID={`slot-${slot.startAt}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active, disabled: past }}
                  disabled={past}
                  onPress={() => handleSelectSlot(slot.startAt)}
                  style={({ pressed }: { pressed: boolean }) => [
                    styles.slotChip,
                    active ? styles.slotChipActive : null,
                    past ? styles.slotChipPast : null,
                    pressed && !past ? styles.pressed : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.slotChipText,
                      active ? styles.slotChipTextActive : null,
                      past ? styles.slotChipTextPast : null,
                    ]}
                  >
                    {slotLabel(slot.startAt)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>

      {/* ---- Confirm / summary --------------------------------------- */}
      {selectedSlot && bookingStatus !== 'success' ? (
        <View testID="booking-summary" style={styles.summaryCard}>
          <Text style={styles.sectionTitle}>{t('booking.summaryTitle')}</Text>
          {selectedServiceObj ? (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{t('booking.stepService')}</Text>
              <Text style={styles.summaryValue}>{selectedServiceObj.name}</Text>
            </View>
          ) : null}
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t('booking.stepDate')}</Text>
            <Text style={styles.summaryValue}>{jalaliLabel(date)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t('booking.stepTime')}</Text>
            <Text style={styles.summaryValue}>{slotLabel(selectedSlot)}</Text>
          </View>
          {selectedServiceObj ? (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{t('booking.price')}</Text>
              <Text style={styles.summaryValue}>
                {t('booking.priceRial', { amount: formatRial(selectedServiceObj.priceRial) })}
              </Text>
            </View>
          ) : null}

          {bookingStatus === 'redirecting' ? (
            <View testID="booking-redirect" style={styles.redirectRow} accessibilityRole="alert">
              <ActivityIndicator color={theme.colors.primary} />
              <Text style={styles.redirectText}>{t('booking.paymentRedirect')}</Text>
            </View>
          ) : null}

          {bookingStatus === 'error' ? (
            <Text testID="booking-error" accessibilityRole="alert" style={styles.errorBody}>
              {bookingError || t('booking.failedBody')}
            </Text>
          ) : null}

          <Pressable
            testID="confirm-button"
            accessibilityRole="button"
            accessibilityState={{
              disabled: bookingStatus === 'loading' || bookingStatus === 'redirecting',
              busy: bookingStatus === 'loading' || bookingStatus === 'redirecting',
            }}
            disabled={bookingStatus === 'loading' || bookingStatus === 'redirecting'}
            onPress={handleConfirm}
            style={({ pressed }: { pressed: boolean }) => [
              styles.primaryButton,
              bookingStatus === 'loading' || bookingStatus === 'redirecting'
                ? styles.primaryButtonDisabled
                : null,
              pressed ? styles.pressed : null,
            ]}
          >
            {bookingStatus === 'loading' ? (
              <ActivityIndicator
                testID="booking-loading"
                color={theme.colors.primaryContrast}
              />
            ) : (
              <Text style={styles.primaryButtonText}>{t('booking.confirm')}</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      {/* ---- Success ------------------------------------------------- */}
      {bookingStatus === 'success' ? (
        <View testID="booking-success" style={styles.successCard} accessibilityRole="alert">
          <Text style={styles.successTitle}>{t('booking.pending')}</Text>
          <Text style={styles.successBody}>{t('booking.pendingBody')}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Token-driven styles for the active theme (no raw hex literals leak in). */
function createStyles(theme: RnTheme) {
  const { colors, spacing, radius, typography } = theme;
  const base = typography.baseline;
  const v = typography.variants;
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.bg,
      padding: spacing[4],
      gap: spacing[5],
    },
    title: {
      ...base,
      fontSize: v.xl.fontSize,
      lineHeight: v.xl.lineHeight,
      fontWeight: '700',
      color: colors.text,
    },
    stepper: {
      flexDirection: 'row-reverse',
      justifyContent: 'space-between',
      gap: spacing[2],
    },
    step: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing[1],
    },
    stepNum: {
      ...base,
      fontSize: v['2xs'].fontSize,
      lineHeight: v['2xs'].lineHeight,
      fontWeight: '700',
      color: colors.primaryContrast,
      backgroundColor: colors.primary,
      borderRadius: radius.pill,
      minWidth: 20,
      textAlign: 'center',
    },
    stepLabel: {
      ...base,
      fontSize: v['2xs'].fontSize,
      lineHeight: v['2xs'].lineHeight,
      color: colors.textMuted,
    },
    section: {
      gap: spacing[3],
    },
    sectionTitle: {
      ...base,
      fontSize: v.lg.fontSize,
      lineHeight: v.lg.lineHeight,
      fontWeight: '700',
      color: colors.text,
    },
    hint: {
      ...base,
      fontSize: v.sm.fontSize,
      lineHeight: v.sm.lineHeight,
      color: colors.textMuted,
    },
    // --- service cards / skeletons ---
    skeletonList: {
      gap: spacing[2],
    },
    skeletonCard: {
      minHeight: 64,
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: radius.md,
      opacity: 0.6,
    },
    serviceList: {
      gap: spacing[2],
    },
    serviceCard: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: radius.md,
      padding: spacing[4],
      gap: spacing[2],
      minHeight: 64,
    },
    serviceCardActive: {
      borderColor: colors.primary,
      borderWidth: 2,
    },
    serviceName: {
      ...base,
      fontSize: v.sm.fontSize,
      lineHeight: v.sm.lineHeight,
      fontWeight: '700',
      color: colors.text,
    },
    serviceMeta: {
      flexDirection: 'row-reverse',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: spacing[3],
    },
    serviceMetaText: {
      ...base,
      fontSize: v.xs.fontSize,
      lineHeight: v.xs.lineHeight,
      color: colors.textMuted,
    },
    servicePrice: {
      ...base,
      fontSize: v.xs.fontSize,
      lineHeight: v.xs.lineHeight,
      fontWeight: '600',
      color: colors.text,
    },
    // --- calendar ---
    calendar: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: radius.lg,
      padding: spacing[3],
      gap: spacing[3],
    },
    calendarHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    calNav: {
      minWidth: 44,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.md,
    },
    calNavText: {
      ...base,
      fontSize: v.lg.fontSize,
      lineHeight: v.lg.lineHeight,
      fontWeight: '700',
      color: colors.primary,
    },
    calMonthLabel: {
      ...base,
      fontSize: v.sm.fontSize,
      lineHeight: v.sm.lineHeight,
      fontWeight: '700',
      color: colors.text,
    },
    weekRow: {
      flexDirection: 'row-reverse',
      justifyContent: 'space-between',
    },
    weekday: {
      ...base,
      width: `${100 / 7}%`,
      textAlign: 'center',
      fontSize: v['2xs'].fontSize,
      lineHeight: v['2xs'].lineHeight,
      color: colors.textMuted,
    },
    dayGrid: {
      flexDirection: 'row-reverse',
      flexWrap: 'wrap',
    },
    dayCell: {
      width: `${100 / 7}%`,
      aspectRatio: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayCellDay: {
      borderRadius: radius.md,
    },
    dayCellActive: {
      backgroundColor: colors.primary,
    },
    dayCellDisabled: {
      opacity: 0.4,
    },
    dayText: {
      ...base,
      textAlign: 'center',
      fontSize: v.sm.fontSize,
      lineHeight: v.sm.lineHeight,
      color: colors.text,
    },
    dayTextActive: {
      color: colors.primaryContrast,
      fontWeight: '700',
    },
    dayTextDisabled: {
      color: colors.textMuted,
    },
    // --- slot grid ---
    slotGrid: {
      flexDirection: 'row-reverse',
      flexWrap: 'wrap',
      gap: spacing[2],
    },
    slotChip: {
      minWidth: 72,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing[3],
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: radius.md,
    },
    skeletonChip: {
      opacity: 0.6,
    },
    slotChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    slotChipPast: {
      opacity: 0.4,
    },
    slotChipText: {
      ...base,
      textAlign: 'center',
      fontSize: v.sm.fontSize,
      lineHeight: v.sm.lineHeight,
      color: colors.text,
    },
    slotChipTextActive: {
      color: colors.primaryContrast,
      fontWeight: '700',
    },
    slotChipTextPast: {
      color: colors.textMuted,
    },
    // --- empty / error ---
    emptyCard: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: radius.lg,
      padding: spacing[5],
      gap: spacing[2],
    },
    emptyTitle: {
      ...base,
      fontSize: v.md.fontSize,
      lineHeight: v.md.lineHeight,
      fontWeight: '700',
      color: colors.text,
    },
    emptyBody: {
      ...base,
      fontSize: v.xs.fontSize,
      lineHeight: v.xs.lineHeight,
      color: colors.textMuted,
    },
    errorCard: {
      backgroundColor: colors.surface,
      borderColor: colors.danger,
      borderWidth: 1,
      borderRadius: radius.lg,
      padding: spacing[4],
      gap: spacing[2],
    },
    errorTitle: {
      ...base,
      fontSize: v.md.fontSize,
      lineHeight: v.md.lineHeight,
      fontWeight: '700',
      color: colors.danger,
    },
    errorBody: {
      ...base,
      fontSize: v.xs.fontSize,
      lineHeight: v.xs.lineHeight,
      color: colors.textMuted,
    },
    retryButton: {
      alignSelf: 'flex-start',
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: spacing[4],
      borderRadius: radius.md,
      borderColor: colors.border,
      borderWidth: 1,
    },
    retryButtonText: {
      ...base,
      fontSize: v.xs.fontSize,
      lineHeight: v.xs.lineHeight,
      fontWeight: '600',
      color: colors.primary,
    },
    // --- summary / confirm ---
    summaryCard: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: radius.lg,
      padding: spacing[4],
      gap: spacing[3],
    },
    summaryRow: {
      flexDirection: 'row-reverse',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: spacing[3],
    },
    summaryLabel: {
      ...base,
      fontSize: v.xs.fontSize,
      lineHeight: v.xs.lineHeight,
      color: colors.textMuted,
    },
    summaryValue: {
      ...base,
      fontSize: v.sm.fontSize,
      lineHeight: v.sm.lineHeight,
      fontWeight: '600',
      color: colors.text,
    },
    redirectRow: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      gap: spacing[2],
    },
    redirectText: {
      ...base,
      fontSize: v.xs.fontSize,
      lineHeight: v.xs.lineHeight,
      color: colors.info,
    },
    primaryButton: {
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing[4],
    },
    primaryButtonDisabled: {
      opacity: 0.5,
    },
    primaryButtonText: {
      ...base,
      textAlign: 'center',
      fontSize: v.sm.fontSize,
      lineHeight: v.sm.lineHeight,
      fontWeight: '700',
      color: colors.primaryContrast,
    },
    pressed: {
      opacity: 0.85,
    },
    // --- success ---
    successCard: {
      backgroundColor: colors.surface,
      borderColor: colors.success,
      borderWidth: 1,
      borderRadius: radius.lg,
      padding: spacing[5],
      gap: spacing[2],
    },
    successTitle: {
      ...base,
      fontSize: v.lg.fontSize,
      lineHeight: v.lg.lineHeight,
      fontWeight: '700',
      color: colors.success,
    },
    successBody: {
      ...base,
      fontSize: v.sm.fontSize,
      lineHeight: v.sm.lineHeight,
      color: colors.text,
    },
  });
}

export default AvailabilityScreen;
