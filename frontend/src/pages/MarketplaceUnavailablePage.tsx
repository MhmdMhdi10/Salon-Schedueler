import { ArrowRight, Building2, CalendarPlus, SearchX } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { SeoHead } from '../components/seo';

/** Honest customer entry while the city/service marketplace is being seeded. */
export function MarketplaceUnavailablePage() {
  const location = useLocation();
  const isCustomerEntry = location.pathname === '/search';

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center px-4 py-12 text-center sm:py-20">
      <SeoHead title="رزرو نوبت در آرا" />
      <span className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        {isCustomerEntry ? (
          <SearchX className="size-8" aria-hidden="true" />
        ) : (
          <CalendarPlus className="size-8" aria-hidden="true" />
        )}
      </span>
      <p className="mt-6 text-sm font-semibold text-primary">رزرو نوبت با آرا</p>
      <h1 className="mt-2 text-2xl font-bold leading-display text-text sm:text-3xl">
        هنوز فهرست عمومی سالن‌ها آماده نیست
      </h1>
      <p className="mt-4 max-w-xl text-sm leading-7 text-muted">
        برای رزرو، لینک مستقیم یا QR سالن را باز کنید. اگر هنوز لینک سالن را ندارید، با ورود به حساب
        مشتری ادامه دهید؛ به‌محض فعال‌شدن فهرست سالن‌ها همین‌جا جست‌وجو در دسترس خواهد بود.
      </p>
      <div className="mt-7 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <Link
          to="/auth?intent=customer"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-pill bg-primary px-6 py-3 text-sm font-medium text-primary-contrast shadow-1 hover:opacity-90"
        >
            ورود برای رزرو
            <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden="true" />
        </Link>
        <Link
          to="/business/register"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-surface px-6 py-3 text-sm font-medium text-text hover:bg-elevated"
        >
            <Building2 className="size-4" aria-hidden="true" />
            ثبت سالن
        </Link>
      </div>
      <p className="mt-8 text-xs text-muted">
        سالن‌دار هستید؟ از <Link className="text-primary underline" to="/business/register">اینجا</Link> شروع کنید.
      </p>
    </div>
  );
}

export default MarketplaceUnavailablePage;
