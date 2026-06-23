import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { adminApi, ApiError } from '../../api/client';

/**
 * Admin analytics screen: utilization, revenue, and busiest-window figures
 * fetched from the analytics endpoint via `adminApi.getAnalytics`. Rendered as
 * numbers/tables (not charts). Surfaces loading, success, and error states.
 *
 * Requirements: 7.3, 7.5 (orig R16)
 */

const DEFAULT_SALON_ID = 'salon-1';

type LoadStatus = 'loading' | 'success' | 'error';

interface AnalyticsData {
  utilization: unknown;
  revenue: unknown;
  busiestWindows: unknown;
}

/** Default analytics window: the last 30 days up to today (ISO dates). */
function defaultRange(today: Date): { from: string; to: string } {
  const from = new Date(today);
  from.setDate(from.getDate() - 30);
  return { from: from.toISOString().slice(0, 10), to: today.toISOString().slice(0, 10) };
}

/** Flatten an opaque value into [label, value] rows for tabular display. */
function toRows(value: unknown): Array<{ label: string; value: string }> {
  if (value == null) return [];
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
    return [{ label: '', value: String(value) }];
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => ({
      label: String(index + 1),
      value: typeof entry === 'object' ? JSON.stringify(entry) : String(entry),
    }));
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).map(([label, v]) => ({
      label,
      value: typeof v === 'object' ? JSON.stringify(v) : String(v),
    }));
  }
  return [{ label: '', value: String(value) }];
}

interface FigureTableProps {
  testId: string;
  title: string;
  value: unknown;
  emptyText: string;
}

function FigureTable({ testId, title, value, emptyText }: FigureTableProps) {
  const rows = toRows(value);
  return (
    <section>
      <h2>{title}</h2>
      {rows.length === 0 ? (
        <p data-testid={`${testId}-empty`}>{emptyText}</p>
      ) : (
        <table data-testid={testId}>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.label}-${index}`}>
                {row.label !== '' && <th scope="row">{row.label}</th>}
                <td>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function AnalyticsPage({ salonId: salonIdProp }: { salonId?: string }) {
  const { t } = useTranslation();
  const params = useParams<{ salonId?: string }>();
  const salonId = salonIdProp ?? params.salonId ?? DEFAULT_SALON_ID;

  const [status, setStatus] = useState<LoadStatus>('loading');
  const [error, setError] = useState('');
  const [data, setData] = useState<AnalyticsData | null>(null);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setError('');

    const { from, to } = defaultRange(new Date());
    adminApi
      .getAnalytics(salonId, from, to)
      .then((res) => {
        if (!active) return;
        setData(res);
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

  return (
    <div data-testid="admin-analytics">
      <h1>{t('admin.analytics')}</h1>

      {status === 'loading' && (
        <p data-testid="analytics-loading">{t('app.loading')}</p>
      )}

      {status === 'error' && (
        <p role="alert" data-testid="analytics-error">{error}</p>
      )}

      {status === 'success' && data && (
        <>
          <FigureTable
            testId="analytics-utilization"
            title="بهره‌وری"
            value={data.utilization}
            emptyText={t('booking.noSlots')}
          />
          <FigureTable
            testId="analytics-revenue"
            title="درآمد"
            value={data.revenue}
            emptyText={t('booking.noSlots')}
          />
          <FigureTable
            testId="analytics-busiest"
            title="شلوغ‌ترین ساعات"
            value={data.busiestWindows}
            emptyText={t('booking.noSlots')}
          />
        </>
      )}
    </div>
  );
}
