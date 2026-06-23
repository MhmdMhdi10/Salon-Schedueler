import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { adminApi, ApiError } from '../../api/client';

/**
 * Admin calendar screen: day/week appointment views fetched from the calendar
 * endpoint via `adminApi.getCalendar`. A toggle switches between day and week
 * ranges and refetches. Surfaces loading, success, and error states.
 *
 * Requirements: 7.2, 7.5 (orig R15)
 */

const DEFAULT_SALON_ID = 'salon-1';

type CalendarView = 'day' | 'week';
type LoadStatus = 'loading' | 'success' | 'error';

/** ISO date (YYYY-MM-DD) `days` from `base`. */
function isoDate(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Compute the [from, to] range for a view, anchored at `today`. */
function rangeFor(view: CalendarView, today: Date): { from: string; to: string } {
  if (view === 'day') {
    return { from: isoDate(today, 0), to: isoDate(today, 1) };
  }
  return { from: isoDate(today, 0), to: isoDate(today, 7) };
}

/** Best-effort label for an opaque appointment record. */
function appointmentLabel(appt: unknown): string {
  if (appt && typeof appt === 'object') {
    const rec = appt as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof rec.startAt === 'string') parts.push(rec.startAt);
    if (typeof rec.endAt === 'string') parts.push(`- ${rec.endAt}`);
    if (typeof rec.serviceName === 'string') parts.push(rec.serviceName);
    if (typeof rec.customerName === 'string') parts.push(rec.customerName);
    if (typeof rec.staffName === 'string') parts.push(rec.staffName);
    if (typeof rec.status === 'string') parts.push(`(${rec.status})`);
    if (parts.length > 0) return parts.join(' ');
    if (typeof rec.id === 'string') return rec.id;
  }
  return String(appt);
}

export function CalendarPage({ salonId: salonIdProp }: { salonId?: string }) {
  const { t } = useTranslation();
  const params = useParams<{ salonId?: string }>();
  const salonId = salonIdProp ?? params.salonId ?? DEFAULT_SALON_ID;

  const [view, setView] = useState<CalendarView>('day');
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [error, setError] = useState('');
  const [appointments, setAppointments] = useState<unknown[]>([]);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setError('');

    const { from, to } = rangeFor(view, new Date());
    adminApi
      .getCalendar(salonId, from, to, view)
      .then((res) => {
        if (!active) return;
        setAppointments(res.appointments);
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
  }, [salonId, view, t]);

  return (
    <div data-testid="admin-calendar">
      <h1>{t('admin.calendar')}</h1>
      <div role="tablist">
        <button
          role="tab"
          aria-selected={view === 'day'}
          onClick={() => setView('day')}
        >
          روز
        </button>
        <button
          role="tab"
          aria-selected={view === 'week'}
          onClick={() => setView('week')}
        >
          هفته
        </button>
      </div>

      <div data-testid={`calendar-${view}`}>
        {status === 'loading' && (
          <p data-testid="calendar-loading">{t('app.loading')}</p>
        )}

        {status === 'error' && (
          <p role="alert" data-testid="calendar-error">{error}</p>
        )}

        {status === 'success' && (
          <ul data-testid="calendar-appointments">
            {appointments.length === 0 ? (
              <li data-testid="calendar-empty">{t('booking.noSlots')}</li>
            ) : (
              appointments.map((appt, index) => (
                <li key={index}>{appointmentLabel(appt)}</li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
