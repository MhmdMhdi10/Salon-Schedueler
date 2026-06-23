import { useTranslation } from 'react-i18next';

/**
 * Analytics dashboards: utilization, revenue, busiest windows.
 * Requirements: 16.1
 */
export function AnalyticsPage() {
  const { t } = useTranslation();

  return (
    <div data-testid="admin-analytics">
      <h1>{t('admin.analytics')}</h1>
      <section>
        <h2>بهره‌وری صندلی</h2>
        <p>Chair utilization chart placeholder</p>
      </section>
      <section>
        <h2>بهره‌وری کارکنان</h2>
        <p>Staff utilization chart placeholder</p>
      </section>
      <section>
        <h2>درآمد</h2>
        <p>Revenue chart placeholder</p>
      </section>
      <section>
        <h2>شلوغ‌ترین ساعات</h2>
        <p>Busiest windows chart placeholder</p>
      </section>
    </div>
  );
}
