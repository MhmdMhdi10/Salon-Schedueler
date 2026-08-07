import { useCallback, useEffect, useState } from 'react';
import { CalendarPlus, QrCode, Scissors, Store, Trash2 } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { SeoHead } from '../components/seo';
import { cn } from '../components/ui';
import {
  readSavedSalons,
  removeSavedSalon,
  savedSalonBookingPath,
  SAVED_SALONS_CHANGED,
  type SavedSalon,
} from '../utils/savedSalons';
import { writeSalonName } from '../utils/salonName';

export function MySalonsPage() {
  const { isCustomer } = useAuth();
  const [salons, setSalons] = useState<SavedSalon[]>(readSavedSalons);
  const refresh = useCallback(() => setSalons(readSavedSalons()), []);

  useEffect(() => {
    window.addEventListener('storage', refresh);
    window.addEventListener(SAVED_SALONS_CHANGED, refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener(SAVED_SALONS_CHANGED, refresh);
    };
  }, [refresh]);

  // Keep old anonymous QR storage route available, but send signed-in
  // customers to the full account surface (also covers the PWA start URL).
  if (isCustomer) return <Navigate to="/account" replace />;

  const remove = (salon: SavedSalon) => {
    setSalons(removeSavedSalon(salon.id, salon.staffId));
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10" data-testid="my-salons-page">
      <SeoHead
        title="سالن‌های من"
        description="دسترسی سریع به سالن‌هایی که کد QR آن‌ها را اسکن کرده‌اید"
      />
      <header>
        <p className="text-sm font-semibold text-primary">رزرو سریع</p>
        <h1 className="mt-2 text-display text-3xl text-text">سالن‌های من</h1>
        <p className="mt-2 max-w-xl text-sm leading-7 text-muted">
          هر سالنی که QR آن را اسکن کنید اینجا روی همین دستگاه می‌ماند.
        </p>
      </header>

      {salons.length === 0 ? (
        <section className="mt-8 flex flex-col items-center rounded-2xl border border-border bg-elevated px-6 py-12 text-center">
          <QrCode className="h-12 w-12 text-primary" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-bold text-text">هنوز سالنی ذخیره نشده</h2>
          <p className="mt-2 max-w-sm text-sm leading-7 text-muted">
            QR موجود در سالن را با دوربین گوشی اسکن کنید؛ سالن خودکار به این فهرست اضافه می‌شود.
          </p>
          <Link
            to="/"
            className="mt-6 inline-flex min-h-[44px] items-center rounded-pill bg-primary px-5 text-sm font-semibold text-primary-contrast no-underline"
          >
            بازگشت به آرا
          </Link>
        </section>
      ) : (
        <ul className="mt-8 grid gap-4" aria-label="سالن‌های ذخیره‌شده">
          {salons.map((salon) => (
            <li
              key={`${salon.id}:${salon.staffId ?? ''}`}
              className="flex items-center gap-4 rounded-2xl border border-border bg-elevated p-4 shadow-1"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                {salon.staffId ? (
                  <Scissors className="h-6 w-6" aria-hidden="true" />
                ) : (
                  <Store className="h-6 w-6" aria-hidden="true" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-bold text-text">{salon.name}</h2>
                <p className="mt-1 truncate text-xs text-muted">
                  {salon.staffName ? `با ${salon.staffName}` : 'رزرو مستقیم نوبت'}
                </p>
              </div>
              <Link
                to={savedSalonBookingPath(salon)}
                onClick={() => writeSalonName(salon.id, salon.name)}
                className={cn(
                  'inline-flex min-h-[44px] items-center gap-2 rounded-pill bg-primary px-4 text-sm font-semibold text-primary-contrast no-underline',
                  'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                )}
              >
                <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                نوبت
              </Link>
              <button
                type="button"
                onClick={() => remove(salon)}
                aria-label={`حذف ${salon.name}`}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-danger/10 hover:text-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default MySalonsPage;
