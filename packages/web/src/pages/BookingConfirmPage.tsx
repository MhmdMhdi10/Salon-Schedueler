import { useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { bookingApi } from '../api/client';

/**
 * Booking confirmation with payment redirect handling.
 * Requirements: 9.7, 10.2
 */
export function BookingConfirmPage() {
  const { t } = useTranslation();
  const { salonId } = useParams<{ salonId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const state = location.state as { serviceId: string; startAt: string } | undefined;

  const handleConfirm = async () => {
    if (!salonId || !state) return;
    setLoading(true);
    setError('');
    try {
      const result = await bookingApi.create({
        salonId,
        serviceId: state.serviceId,
        startAt: state.startAt,
      });

      if (result.status === 'held' && result.paymentRedirectUrl) {
        // Redirect to payment gateway
        window.location.href = result.paymentRedirectUrl;
      } else if (result.status === 'confirmed') {
        navigate('/booking/success');
      } else {
        setError(t('booking.failed'));
      }
    } catch {
      setError(t('booking.failed'));
    } finally {
      setLoading(false);
    }
  };

  if (!state) {
    return <p>{t('booking.failed')}</p>;
  }

  return (
    <div data-testid="booking-confirm">
      <h1>{t('booking.confirm')}</h1>
      <p>{state.startAt}</p>
      <button onClick={handleConfirm} disabled={loading}>
        {loading ? t('booking.paymentRedirect') : t('booking.confirm')}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
