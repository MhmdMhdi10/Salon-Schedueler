import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, Clock3 } from 'lucide-react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { salonApi, waitlistApi } from '../api/client';
import { SeoHead } from '../components/seo';
import { Button, Card, ErrorState, Skeleton } from '../components/ui';

interface WaitlistState {
  serviceId?: string;
  date?: string;
}

/** Small customer surface for joining a selected day after availability is full. */
export function WaitlistPage() {
  const { t } = useTranslation();
  const { salonId } = useParams<{ salonId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { status: authStatus, isCustomer } = useAuth();
  const state = (location.state as WaitlistState | null) ?? null;
  const [serviceName, setServiceName] = useState('خدمت انتخاب‌شده');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<'idle' | 'success' | 'error'>('idle');

  const dayWindow = useMemo(() => {
    if (!state?.date || !/^\d{4}-\d{2}-\d{2}$/.test(state.date)) return null;
    const start = new Date(`${state.date}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime())) return null;
    return {
      start: start.toISOString(),
      end: new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    };
  }, [state?.date]);

  useEffect(() => {
    if (!salonId || !state?.serviceId) {
      setLoading(false);
      return;
    }
    let active = true;
    salonApi
      .getServices(salonId)
      .then(({ services }) => {
        if (!active) return;
        const service = services.find((item) => item.id === state.serviceId);
        if (service) setServiceName(service.name);
        setLoading(false);
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [salonId, state?.serviceId]);

  if (authStatus === 'loading') return <Skeleton variant="rect" className="mx-auto mt-10 h-64 max-w-xl" />;
  if (!isCustomer) {
    return (
      <Navigate
        to="/auth"
        state={{
          returnTo: `/salon/${salonId}/waitlist`,
          returnState: state ?? undefined,
        }}
        replace
      />
    );
  }

  if (!salonId || !state?.serviceId || !dayWindow) {
    return (
      <main className="mx-auto max-w-xl px-4 py-10">
      <ErrorState
          title="اطلاعات انتظار ناقص است"
          description="از صفحه انتخاب زمان دوباره اقدام کن."
        />
        <Button onClick={() => navigate(-1)}>بازگشت</Button>
      </main>
    );
  }

  const join = async () => {
    setSubmitting(true);
    setResult('idle');
    try {
      await waitlistApi.join(salonId, state.serviceId!, dayWindow.start, dayWindow.end);
      setResult('success');
    } catch {
      setResult('error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 py-8 sm:py-12">
      <SeoHead title="لیست انتظار" />
      <Card as="section" className="flex flex-col gap-5 p-6 text-center sm:p-8">
        {loading ? (
          <div role="status" aria-busy="true" className="flex flex-col gap-3">
            <Skeleton variant="circle" className="mx-auto h-12 w-12" />
            <Skeleton variant="text" className="mx-auto h-7 w-2/3" />
            <Skeleton variant="text" className="mx-auto w-full" />
          </div>
        ) : result === 'success' ? (
          <>
            <CheckCircle2 className="mx-auto h-12 w-12 text-success" aria-hidden="true" />
            <h1 className="text-2xl font-bold text-text">در لیست انتظار قرار گرفتی</h1>
            <p className="text-sm leading-7 text-muted">
              اگر برای {serviceName} در این روز زمانی آزاد شود، پیامک اطلاع‌رسانی برایت ارسال می‌شود.
            </p>
            <Button onClick={() => navigate('/account')}>مشاهده حساب من</Button>
          </>
        ) : (
          <>
            <Clock3 className="mx-auto h-12 w-12 text-primary" aria-hidden="true" />
            <h1 className="text-2xl font-bold text-text">لیست انتظار این روز</h1>
            <p className="text-sm leading-7 text-muted">
              برای خدمت «{serviceName}» در تاریخ {state.date} در صف اطلاع‌رسانی قرار بگیر.
            </p>
            {result === 'error' && (
              <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
                ثبت در لیست انتظار انجام نشد؛ دوباره تلاش کن.
              </p>
            )}
            <Button loading={submitting} onClick={() => void join()}>
              ثبت در لیست انتظار
            </Button>
            <Button variant="ghost" onClick={() => navigate(`/salon/${salonId}/book`)}>
              <CalendarClock className="h-4 w-4" aria-hidden="true" />
              انتخاب روز دیگر
            </Button>
          </>
        )}
      </Card>
    </main>
  );
}

export default WaitlistPage;
