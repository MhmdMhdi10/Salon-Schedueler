import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

/**
 * Success confirmation after booking.
 * Requirement: 9.7
 */
export function BookingSuccessPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div data-testid="booking-success">
      <h1>{t('booking.success')}</h1>
      <button onClick={() => navigate('/')}>{t('common.back')}</button>
    </div>
  );
}
