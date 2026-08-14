import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Armchair, ArrowLeft, RefreshCw, TriangleAlert } from 'lucide-react';
import { adminApi, salonApi, workingHoursApi } from '../../api/client';
import { Button } from '../ui/Button';

type SetupIssueKey = 'chairs' | 'services' | 'staff' | 'hours';

interface SetupIssue {
  key: SetupIssueKey;
  title: string;
  description: string;
  to: string;
}

function isActiveResource(value: unknown): boolean {
  return Boolean(
    value && typeof value === 'object' && (value as { active?: unknown }).active !== false,
  );
}

/**
 * Persistent owner-panel guardrail for configuration gaps that stop booking.
 * It cannot be dismissed: resolving the underlying issue is the only way it
 * disappears. Existing APIs are intentionally reused so health rules cannot
 * drift away from the configuration/calendar surfaces that fix them.
 */
export function OwnerSetupAlert({ salonId, refreshKey }: { salonId: string; refreshKey?: string }) {
  const [issues, setIssues] = useState<SetupIssue[]>([]);
  const [creatingChair, setCreatingChair] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState('');

  const load = useCallback(async () => {
    try {
      const [staffResult, chairsResult, servicesResult, hoursResult] = await Promise.all([
        adminApi.getStaff(salonId),
        adminApi.getChairs(salonId),
        salonApi.getServices(salonId),
        workingHoursApi.getSalon(salonId),
      ]);
      const activeStaff = staffResult.staff.filter((item) => item.active && item.role !== 'Admin');
      const activeChairs = chairsResult.chairs.filter(isActiveResource);
      const next: SetupIssue[] = [];

      if (activeChairs.length === 0) {
        next.push({
          key: 'chairs',
          title: 'هیچ صندلی فعالی تعریف نشده',
          description: 'رزرو مشتری تا تعریف حداقل یک صندلی کاملاً متوقف است.',
          to: '/owner/config#chairs',
        });
      }
      if (servicesResult.services.length === 0) {
        next.push({
          key: 'services',
          title: 'هنوز سرویسی برای رزرو نداری',
          description: 'حداقل یک خدمت مثل کوتاهی یا اصلاح تعریف کن.',
          to: '/owner/config#services',
        });
      }
      if (activeStaff.length === 0) {
        next.push({
          key: 'staff',
          title: 'نیروی قابل رزرو وجود ندارد',
          description: 'یک آرایشگر فعال لازم است تا نوبت به او اختصاص پیدا کند.',
          to: '/owner/team',
        });
      }
      if (activeStaff.length > 0 && activeChairs.length > 0 && hoursResult.hours.length === 0) {
        next.push({
          key: 'hours',
          title: 'ساعت کاری مشخص نشده',
          description: 'بدون برنامه هفتگی هیچ زمان آزادی به مشتری نمایش داده نمی‌شود.',
          to: '/owner/calendar',
        });
      }

      setIssues(next);
      setLoadError(false);
    } catch {
      // A failed health check must not replace the page with a false alarm.
      setLoadError(true);
    }
  }, [salonId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    const interval = window.setInterval(() => void load(), 30_000);
    const refresh = () => void load();
    window.addEventListener('focus', refresh);
    window.addEventListener('salon-config-changed', refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('salon-config-changed', refresh);
    };
  }, [load]);

  if (issues.length === 0 && !loadError) return null;

  const createDefaultChair = async () => {
    setCreatingChair(true);
    setActionError('');
    try {
      await adminApi.createChair(salonId, { name: 'صندلی ۱' });
      window.dispatchEvent(new Event('salon-config-changed'));
    } catch {
      setActionError('ساخت صندلی انجام نشد؛ دوباره تلاش کن یا از تنظیمات سالن بساز.');
    } finally {
      setCreatingChair(false);
      await load();
    }
  };

  if (loadError && issues.length === 0) {
    return (
      <aside
        className="static z-sticky mb-3 flex items-center justify-between gap-2 rounded-xl border border-warning/35 bg-warning/10 px-3 py-2 shadow-2 sm:sticky sm:top-0 sm:mb-4 sm:gap-3 sm:px-4 sm:py-3"
        role="status"
      >
        <span className="text-xs font-bold text-warning sm:text-sm">
          بررسی آماده‌بودن رزرو انجام نشد.
        </span>
        <Button
          type="button"
          variant="ghost"
          size="md"
          aria-label="بررسی دوباره"
          onClick={() => void load()}
          startIcon={<RefreshCw className="h-4 w-4" />}
          className="!px-2 sm:!px-5"
        >
          <span className="hidden sm:inline">بررسی دوباره</span>
        </Button>
      </aside>
    );
  }

  return (
    <aside
      data-testid="owner-setup-alert"
      className="static z-sticky mb-3 overflow-hidden rounded-xl border border-danger/40 bg-danger/10 shadow-2 backdrop-blur sm:sticky sm:top-0 sm:mb-4 sm:rounded-2xl"
      aria-labelledby="owner-setup-alert-title"
    >
      <div className="flex items-start gap-2 p-3 sm:items-center sm:gap-3 sm:p-4">
        <div className="flex min-w-0 flex-1 items-start gap-2 sm:gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-danger text-white shadow-1 sm:h-10 sm:w-10 sm:rounded-xl">
            <TriangleAlert className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <strong
              id="owner-setup-alert-title"
              className="block text-xs font-black leading-5 text-danger sm:text-sm"
            >
              رزرو آنلاین نیاز به رسیدگی دارد
            </strong>
            <p className="mt-0.5 line-clamp-1 text-[0.7rem] leading-5 text-text sm:mt-1 sm:line-clamp-none sm:text-xs">
              {issues.length === 1
                ? issues[0].description
                : `${issues.length} مورد ضروری مانع رزرو درست مشتری است.`}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          {issues.some((item) => item.key === 'chairs') && (
            <Button
              type="button"
              variant="primary"
              size="md"
              loading={creatingChair}
              disabled={creatingChair}
              onClick={() => void createDefaultChair()}
              aria-label="ساخت صندلی پیش‌فرض"
              startIcon={<Armchair className="h-4 w-4" />}
              className="!px-2 sm:!px-5"
            >
              <span className="hidden sm:inline">ساخت صندلی پیش‌فرض</span>
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="md"
            aria-label="بررسی دوباره"
            onClick={() => void load()}
            startIcon={<RefreshCw className="h-4 w-4" />}
            className="!px-2 sm:!px-5"
          >
            <span className="hidden sm:inline">بررسی دوباره</span>
          </Button>
        </div>
      </div>
      <ul className="grid border-t border-danger/20 bg-surface/65 sm:grid-cols-2">
        {issues.map((issue) => (
          <li
            key={issue.key}
            className="border-b border-danger/15 last:border-b-0 sm:border-e sm:last:border-e-0"
          >
            <Link
              to={issue.to}
              className="flex min-h-11 items-center justify-between gap-2 px-3 py-2 text-xs font-bold text-text no-underline transition hover:bg-danger/5 hover:text-danger sm:gap-3 sm:px-4 sm:py-3 sm:text-sm"
            >
              <span>{issue.title}</span>
              <ArrowLeft className="h-4 w-4 shrink-0 rtl:-scale-x-100" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
      {actionError && (
        <p
          role="alert"
          className="border-t border-danger/20 px-4 py-2 text-xs font-bold text-danger"
        >
          {actionError}
        </p>
      )}
    </aside>
  );
}
