import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { salonApi } from '../api/client';

/**
 * QR-resolved salon landing page.
 * When a customer scans the QR, they land here with the payload in the URL.
 * Requirement: 7.2
 */
export function QrLandingPage() {
  const { t } = useTranslation();
  const { payload } = useParams<{ payload: string }>();
  const navigate = useNavigate();
  const [salon, setSalon] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!payload) {
      setError(t('salon.malformedQr'));
      setLoading(false);
      return;
    }

    salonApi.resolveQr(payload)
      .then((result) => {
        setSalon(result.salon);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.code === 'QR_MALFORMED' ? t('salon.malformedQr') : t('salon.notFound'));
        setLoading(false);
      });
  }, [payload, t]);

  if (loading) return <p>{t('app.loading')}</p>;
  if (error) return <p role="alert">{error}</p>;

  return (
    <div data-testid="qr-landing">
      <h1>{salon?.name}</h1>
      <button onClick={() => navigate(`/salon/${salon?.id}/book`)}>
        {t('booking.selectService')}
      </button>
    </div>
  );
}
