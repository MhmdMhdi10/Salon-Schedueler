import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { salonApi } from '../api/client';

/**
 * Service/date availability view.
 * Requirement: 8.1
 */
export function AvailabilityPage() {
  const { t } = useTranslation();
  const { salonId } = useParams<{ salonId: string }>();
  const navigate = useNavigate();
  const [services, setServices] = useState<Array<{ id: string; name: string; durationMinutes: number; priceRial: number }>>([]);
  const [selectedService, setSelectedService] = useState('');
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<Array<{ startAt: string; endAt: string }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (salonId) {
      salonApi.getServices(salonId).then((res) => setServices(res.services)).catch(() => {});
    }
  }, [salonId]);

  useEffect(() => {
    if (salonId && selectedService && date) {
      setLoading(true);
      salonApi.getAvailability(salonId, selectedService, date)
        .then((res) => setSlots(res.slots))
        .catch(() => setSlots([]))
        .finally(() => setLoading(false));
    }
  }, [salonId, selectedService, date]);

  const handleSlotSelect = (startAt: string) => {
    navigate(`/salon/${salonId}/book/confirm`, {
      state: { serviceId: selectedService, startAt },
    });
  };

  return (
    <div data-testid="availability-page">
      <h1>{t('booking.selectService')}</h1>
      <select value={selectedService} onChange={(e) => setSelectedService(e.target.value)} aria-label={t('booking.selectService')}>
        <option value="">{t('booking.selectService')}</option>
        {services.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>

      <h2>{t('booking.selectDate')}</h2>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label={t('booking.selectDate')} />

      {loading && <p>{t('app.loading')}</p>}

      {!loading && slots.length === 0 && selectedService && date && (
        <p>{t('booking.noSlots')}</p>
      )}

      {slots.length > 0 && (
        <div>
          <h2>{t('booking.selectTime')}</h2>
          <ul>
            {slots.map((slot) => (
              <li key={slot.startAt}>
                <button onClick={() => handleSlotSelect(slot.startAt)}>
                  {slot.startAt} - {slot.endAt}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
