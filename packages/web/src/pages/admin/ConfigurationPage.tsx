import { useEffect, useState, FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { adminApi, salonApi, ApiError } from '../../api/client';

/**
 * Admin configuration screen: staff, chairs, services, and holidays management.
 *
 * The staff/chairs/services lists are fetched live from the API client
 * (`adminApi.getStaff`, `adminApi.getChairs`, `salonApi.getServices`) and the
 * screen surfaces loading, success, and error states. Holidays are managed
 * client-side because the API client exposes no holidays endpoint yet; the
 * "add" actions for the server-backed resources append optimistically because
 * the client has no create endpoint either (these are the only non-persisted
 * actions — the read/list views are real and wired).
 *
 * Requirements: 7.1, 7.5 (orig R3, R4, R5)
 */

const DEFAULT_SALON_ID = 'salon-1';

type LoadStatus = 'loading' | 'success' | 'error';

interface ServiceItem {
  id: string;
  name: string;
  durationMinutes: number;
  priceRial: number;
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

interface ManagedListProps {
  id: string;
  testId: string;
  title: string;
  items: string[];
  addLabel: string;
  onAdd: (value: string) => void;
}

/** A titled, functional list with an inline add form. */
function ManagedList({ id, testId, title, items, addLabel, onAdd }: ManagedListProps) {
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
    <section id={id}>
      <h2>{title}</h2>
      <ul data-testid={testId}>
        {items.length === 0 ? (
          <li data-testid={`${testId}-empty`}>{t('booking.noSlots')}</li>
        ) : (
          items.map((label, index) => <li key={`${label}-${index}`}>{label}</li>)
        )}
      </ul>
      <form onSubmit={handleSubmit}>
        <input
          aria-label={addLabel}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button type="submit">{addLabel}</button>
      </form>
    </section>
  );
}

export function ConfigurationPage({ salonId: salonIdProp }: { salonId?: string }) {
  const { t } = useTranslation();
  const params = useParams<{ salonId?: string }>();
  const salonId = salonIdProp ?? params.salonId ?? DEFAULT_SALON_ID;

  const [status, setStatus] = useState<LoadStatus>('loading');
  const [error, setError] = useState('');
  const [staff, setStaff] = useState<unknown[]>([]);
  const [chairs, setChairs] = useState<unknown[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [holidays, setHolidays] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setError('');

    Promise.all([
      adminApi.getStaff(salonId),
      adminApi.getChairs(salonId),
      salonApi.getServices(salonId),
    ])
      .then(([staffRes, chairsRes, servicesRes]) => {
        if (!active) return;
        setStaff(staffRes.staff);
        setChairs(chairsRes.chairs);
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

  const serviceLabels = services.map(
    (s) => `${s.name} — ${s.durationMinutes} دقیقه — ${s.priceRial.toLocaleString('fa-IR')} ریال`
  );

  return (
    <div data-testid="admin-configuration">
      <h1>{t('admin.configuration')}</h1>
      <nav>
        <ul>
          <li><a href="#staff">{t('admin.staff')}</a></li>
          <li><a href="#chairs">{t('admin.chairs')}</a></li>
          <li><a href="#services">{t('admin.services')}</a></li>
          <li><a href="#holidays">{t('admin.holidays')}</a></li>
        </ul>
      </nav>

      {status === 'loading' && (
        <p data-testid="config-loading">{t('app.loading')}</p>
      )}

      {status === 'error' && (
        <p role="alert" data-testid="config-error">{error}</p>
      )}

      {status === 'success' && (
        <>
          <ManagedList
            id="staff"
            testId="staff-list"
            title={t('admin.staff')}
            items={staff.map(itemLabel)}
            addLabel={t('common.save')}
            onAdd={(name) =>
              setStaff((prev) => [...prev, { id: `staff-${prev.length + 1}`, name }])
            }
          />
          <ManagedList
            id="chairs"
            testId="chairs-list"
            title={t('admin.chairs')}
            items={chairs.map(itemLabel)}
            addLabel={t('common.save')}
            onAdd={(name) =>
              setChairs((prev) => [...prev, { id: `chair-${prev.length + 1}`, name }])
            }
          />
          <ManagedList
            id="services"
            testId="services-list"
            title={t('admin.services')}
            items={serviceLabels}
            addLabel={t('common.save')}
            onAdd={(name) =>
              setServices((prev) => [
                ...prev,
                { id: `service-${prev.length + 1}`, name, durationMinutes: 30, priceRial: 0 },
              ])
            }
          />
          <ManagedList
            id="holidays"
            testId="holidays-list"
            title={t('admin.holidays')}
            items={holidays}
            addLabel={t('common.save')}
            onAdd={(date) => setHolidays((prev) => [...prev, date])}
          />
        </>
      )}
    </div>
  );
}
