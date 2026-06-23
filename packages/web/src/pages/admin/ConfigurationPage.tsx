import { useTranslation } from 'react-i18next';

/**
 * Admin configuration screens for resources, services, hours, holidays.
 * Requirements: 3.1, 3.2, 4.1, 5.1
 */
export function ConfigurationPage() {
  const { t } = useTranslation();

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
      <section id="staff">
        <h2>{t('admin.staff')}</h2>
        <p>Staff management placeholder</p>
      </section>
      <section id="chairs">
        <h2>{t('admin.chairs')}</h2>
        <p>Chair management placeholder</p>
      </section>
      <section id="services">
        <h2>{t('admin.services')}</h2>
        <p>Service management placeholder</p>
      </section>
      <section id="holidays">
        <h2>{t('admin.holidays')}</h2>
        <p>Holiday management placeholder</p>
      </section>
    </div>
  );
}
