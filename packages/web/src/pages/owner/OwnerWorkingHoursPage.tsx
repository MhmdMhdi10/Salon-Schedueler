import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { adminApi, type SalonStaff } from '../../api/client';
import { useSalonId } from '../../auth/useSalonId';
import { WeeklySchedulePage } from './OwnerCalendarPage';

/** Full-page weekly schedule editor opened from the owner calendar. */
export function OwnerWorkingHoursPage() {
  const salonId = useSalonId();
  const navigate = useNavigate();
  const [staff, setStaff] = useState<SalonStaff[]>([]);

  useEffect(() => {
    let active = true;
    adminApi
      .getStaff(salonId)
      .then((result) => {
        if (active) setStaff(result.staff);
      })
      .catch(() => {
        if (active) setStaff([]);
      });
    return () => {
      active = false;
    };
  }, [salonId]);

  const goBack = () => navigate('/owner/calendar');

  return (
    <section data-testid="owner-working-hours-page" className="flex flex-col gap-4 sm:gap-5">
      <header className="flex items-center justify-between gap-3">
        <Link
          to="/owner/calendar"
          className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-bold text-text no-underline transition-colors hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
        >
          <ArrowRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
          بازگشت به تقویم
        </Link>
      </header>

      <WeeklySchedulePage salonId={salonId} staff={staff} onCancel={goBack} onSaved={goBack} />
    </section>
  );
}

export default OwnerWorkingHoursPage;
