import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { AuthPage } from './AuthPage';
import { readSalonName } from '../utils/salonName';

interface BookingAuthLocationState {
  returnTo?: string;
  returnState?: Record<string, unknown>;
}

/**
 * Booking-scoped OTP step. It keeps authentication inside the funnel so the
 * customer never sees the global app shell or salon registration CTA while
 * finishing a reservation.
 */
export function BookingAuthPage() {
  const { salonId } = useParams<{ salonId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const routeState = (location.state as BookingAuthLocationState | null) ?? {};
  const confirmPath = salonId ? `/salon/${salonId}/book/confirm` : '';
  const returnState = routeState.returnState;

  const handleBack = () => {
    if (confirmPath && routeState.returnTo === confirmPath) {
      navigate(confirmPath, { state: returnState, replace: true });
      return;
    }
    if (salonId) navigate(`/salon/${salonId}/book`, { replace: true });
  };

  return (
    <AuthPage
      bookingMode
      bookingSalonName={readSalonName(salonId) ?? undefined}
      onBookingBack={handleBack}
    />
  );
}

export default BookingAuthPage;
