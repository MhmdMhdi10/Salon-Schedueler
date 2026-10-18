import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Bell,
  CalendarDays,
  Check,
  CheckCheck,
  CircleDollarSign,
  Package,
  Sparkles,
} from 'lucide-react';
import { inboxApi, type SalonNotification } from '../../api/client';
import { useSalonId } from '../../auth/useSalonId';
import { useInboxWs } from '../../hooks/useInboxWs';
import { SeoHead } from '../../components/seo';
import { Button, ErrorState, Pagination, Skeleton, Spinner, cn } from '../../components/ui';
import { JalaliDate } from '../../components/ui/JalaliDate';
import { Num } from '../../components/ui/Num';
import { getNotificationDestination } from '../../components/owner/notificationDestination';

type Filter = 'all' | 'unread';
type Status = 'loading' | 'success' | 'error';
const NOTIFICATION_PAGE_SIZE = 10;

function typeIcon(type: string) {
  if (type.startsWith('booking.')) return CalendarDays;
  if (type.startsWith('order.')) return Package;
  if (type.startsWith('subscription.')) return CircleDollarSign;
  if (type.startsWith('new.')) return Sparkles;
  return Bell;
}

function relativeTime(
  iso: string,
  t: (k: string, opts?: Record<string, unknown>) => string,
): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = Math.max(0, now - then);
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return t('owner.inbox.justNow', { defaultValue: 'همین الان' });
  if (diffMin < 60)
    return t('owner.inbox.minAgo', { defaultValue: '{{count}} دقیقه پیش', count: diffMin });
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24)
    return t('owner.inbox.hrAgo', { defaultValue: '{{count}} ساعت پیش', count: diffHr });
  const diffDay = Math.floor(diffHr / 24);
  return t('owner.inbox.dayAgo', { defaultValue: '{{count}} روز پیش', count: diffDay });
}

export function OwnerNotificationsPage() {
  const { t } = useTranslation();
  const salonId = useSalonId();
  const { lastEvent, connected, resumeVersion } = useInboxWs(salonId);
  const [filter, setFilter] = useState<Filter>('all');
  const [status, setStatus] = useState<Status>('loading');
  const [items, setItems] = useState<SalonNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [allCount, setAllCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const processedEventId = useRef<string | null>(null);

  // Load only one page. The API returns total so large inboxes never become a
  // 200-row client-side list.
  useEffect(() => {
    if (!salonId) return;
    let active = true;
    setStatus('loading');
    setError(null);
    const offset = (page - 1) * NOTIFICATION_PAGE_SIZE;
    Promise.all([
      inboxApi.list(salonId, {
        onlyUnread: filter === 'unread',
        limit: NOTIFICATION_PAGE_SIZE,
        offset,
      }),
      inboxApi.unreadCount(salonId),
      filter === 'unread' ? inboxApi.list(salonId, { limit: 1 }) : Promise.resolve(null),
    ])
      .then(([listRes, countRes, allRes]) => {
        if (!active) return;
        const nextTotal = Number.isFinite(listRes.total)
          ? listRes.total
          : offset + listRes.notifications.length;
        const lastPage = Math.max(1, Math.ceil(nextTotal / NOTIFICATION_PAGE_SIZE));
        setTotal(nextTotal);
        setUnreadCount(countRes.count);
        if (filter === 'all') setAllCount(nextTotal);
        else if (allRes) {
          setAllCount(
            Number.isFinite(allRes.total) ? allRes.total : allRes.notifications.length,
          );
        }
        if (page > lastPage) {
          setPage(lastPage);
          return;
        }
        setItems(listRes.notifications);
        setStatus('success');
      })
      .catch((e) => {
        if (!active) return;
        setError(
          e?.message ??
            t('owner.inbox.errorBody', { defaultValue: 'بارگذاری اعلان‌ها ناموفق بود' }),
        );
        setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [salonId, filter, page, reloadToken, resumeVersion, t]);

  // Live events get prepended; matches the bell behavior so the page reflects WS.
  useEffect(() => {
    if (!lastEvent || processedEventId.current === lastEvent.id) return;
    processedEventId.current = lastEvent.id;
    setAllCount((count) => count + 1);
    setUnreadCount((u) => u + 1);
    setTotal((count) => count + 1);
    if (page === 1) {
      setItems((list) =>
        [lastEvent, ...list.filter((n) => n.id !== lastEvent.id)].slice(
          0,
          NOTIFICATION_PAGE_SIZE,
        ),
      );
    }
  }, [lastEvent, page]);

  const markOne = useCallback(async (id: string) => {
    const previousItems = items;
    const previousTotal = total;
    const previousUnreadCount = unreadCount;
    setBusy(true);
    setUnreadCount((u) => Math.max(0, u - 1));
    if (filter === 'unread') {
      setItems((list) => list.filter((n) => n.id !== id));
      setTotal((count) => Math.max(0, count - 1));
    } else {
      setItems((list) =>
        list.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
      );
    }
    try {
      await inboxApi.markRead(id);
      if (filter === 'unread') setReloadToken((n) => n + 1);
    } catch {
      setUnreadCount(previousUnreadCount);
      setItems(previousItems);
      setTotal(previousTotal);
    } finally {
      setBusy(false);
    }
  }, [filter, items, total, unreadCount]);

  const markAll = useCallback(async () => {
    if (!salonId) return;
    setBusy(true);
    const prevCount = unreadCount;
    const prevItems = items;
    const prevTotal = total;
    const prevPage = page;
    setUnreadCount(0);
    if (filter === 'unread') {
      setItems([]);
      setTotal(0);
      setPage(1);
    } else {
      setItems((list) =>
        list.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
      );
    }
    try {
      await inboxApi.markAllRead(salonId);
    } catch {
      setUnreadCount(prevCount);
      setItems(prevItems);
      setTotal(prevTotal);
      setPage(prevPage);
    } finally {
      setBusy(false);
    }
  }, [filter, page, salonId, unreadCount, items, total]);

  const counts = useMemo(
    () => ({ all: allCount, unread: unreadCount }),
    [allCount, unreadCount],
  );

  return (
    <section
      data-testid="owner-notifications-page"
      className="flex flex-col gap-4"
    >
      <SeoHead title={t('owner.inbox.pageTitle', { defaultValue: 'اعلان‌ها' })} />

      <header className="flex items-start gap-3 rounded-2xl border border-primary/15 bg-primary/5 p-4 sm:p-5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface text-primary shadow-1">
          <Bell className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl text-display text-text sm:text-2xl">
              {t('owner.inbox.pageTitle', { defaultValue: 'اعلان‌ها' })}
            </h1>
            {unreadCount > 0 && (
              <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-bold tabular-nums text-primary-contrast">
                <Num value={unreadCount} /> خوانده‌نشده
              </span>
            )}
            {connected && (
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-success/20 bg-surface px-2.5 py-1 text-[0.68rem] font-semibold text-success"
                aria-label={t('owner.inbox.live', { defaultValue: 'اتصال زنده' })}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                {t('owner.inbox.live', { defaultValue: 'زنده' })}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm leading-6 text-muted">
            {t('owner.inbox.subtitle', {
              defaultValue: 'رویدادهای سالن و نوبت‌های تازه را اینجا دنبال کن.',
            })}
          </p>
        </div>
      </header>

      {/* Toolbar: filter tabs + mark-all */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="فیلتر اعلان‌ها" className="grid w-full grid-cols-2 rounded-xl border border-border bg-bg p-1 sm:w-auto">
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'all'}
            onClick={() => {
              setPage(1);
              setFilter('all');
            }}
            className={cn(
              'min-h-11 rounded-lg px-4 py-2 text-sm font-semibold transition-colors',
              filter === 'all'
                ? 'bg-primary text-primary-contrast shadow-1'
                : 'text-muted hover:bg-elevated hover:text-text',
            )}
          >
            {t('owner.inbox.filterAll', { defaultValue: 'همه' })}
            <span className="ms-1 text-xs tabular-nums opacity-80">
              <Num value={counts.all} />
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'unread'}
            onClick={() => {
              setPage(1);
              setFilter('unread');
            }}
            className={cn(
              'min-h-11 rounded-lg px-4 py-2 text-sm font-semibold transition-colors',
              filter === 'unread'
                ? 'bg-primary text-primary-contrast shadow-1'
                : 'text-muted hover:bg-elevated hover:text-text',
            )}
          >
            {t('owner.inbox.filterUnread', { defaultValue: 'خوانده‌نشده' })}
            <span className="ms-1 text-xs tabular-nums opacity-80">
              <Num value={unreadCount} />
            </span>
          </button>
        </div>

        {unreadCount > 0 && (
          <Button variant="secondary" size="md" className="w-full sm:w-auto" onClick={markAll} disabled={busy}>
            <CheckCheck className="h-4 w-4" aria-hidden="true" />
            {t('owner.inbox.markAllRead', { defaultValue: 'خواندن همه' })}
          </Button>
        )}
      </div>

      {/* Content */}
      {status === 'loading' && (
        <div
          data-testid="owner-notifications-loading"
          role="status"
          aria-busy="true"
          className="flex flex-col gap-2"
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} variant="rect" className="h-16 rounded-lg" />
          ))}
        </div>
      )}

      {status === 'error' && (
        <ErrorState
          data-testid="owner-notifications-error"
          title={t('owner.inbox.errorTitle', { defaultValue: 'خطا در بارگذاری اعلان‌ها' })}
          description={error ?? ''}
          retryLabel={t('common.retry', { defaultValue: 'تلاش مجدد' })}
          onRetry={() => setReloadToken((n) => n + 1)}
        />
      )}

      {status === 'success' && items.length === 0 && (
        <div
          data-testid="owner-notifications-empty"
          className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-surface px-5 py-12 text-center"
        >
          <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Bell className="size-6" aria-hidden="true" />
          </span>
          <p className="m-0 text-sm font-semibold text-text">
            {filter === 'unread'
              ? t('owner.inbox.noUnread', { defaultValue: 'اعلان خوانده‌نشده‌ای نیست' })
              : t('owner.inbox.empty', { defaultValue: 'اعلانی نیست' })}
          </p>
          <p className="m-0 max-w-sm text-xs leading-5 text-muted">اعلان‌های رزرو و فعالیت سالن در همین صفحه نمایش داده می‌شوند.</p>
        </div>
      )}

      {status === 'success' && items.length > 0 && (
        <>
          {busy && (
            <div
              role="status"
              aria-live="polite"
              className="flex items-center gap-2 text-xs text-muted"
            >
              <Spinner size="sm" />
              {t('common.saving')}
            </div>
          )}
          <ol data-testid="owner-notifications-list" className="overflow-hidden rounded-2xl border border-border bg-surface shadow-1 divide-y divide-border">
          {items.map((n) => {
            const isUnread = !n.readAt;
            const Icon = typeIcon(n.type);
            return (
              <li
                key={n.id}
                className={cn(
                  'flex items-start gap-3 px-3 py-3.5 transition-colors sm:px-4',
                  isUnread ? 'bg-primary/[0.045]' : 'bg-surface hover:bg-elevated/50',
                )}
              >
                <Link
                  to={getNotificationDestination(n)}
                  onClick={() => {
                    if (isUnread) void markOne(n.id);
                  }}
                  className="flex min-w-0 flex-1 items-start gap-3 rounded-lg text-start no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                  aria-label={n.title}
                >
                  <span className={cn('relative mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl', isUnread ? 'bg-primary/10 text-primary' : 'bg-elevated text-muted')}>
                    <Icon className="size-[18px]" aria-hidden="true" />
                    {isUnread && <span className="absolute -end-0.5 -top-0.5 size-2.5 rounded-full border-2 border-surface bg-primary" aria-hidden="true" />}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <span className="min-w-0 flex-1 break-words text-sm font-bold leading-5 text-text">{n.title}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted">
                        <Num value={relativeTime(n.createdAt, t)} />
                      </span>
                    </div>
                    <p className="m-0 line-clamp-2 text-sm leading-6 text-muted">{n.body}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      <span className="tabular-nums">
                        <JalaliDate value={new Date(n.createdAt).toISOString().slice(0, 10)} />
                      </span>
                      {n.payload?.date && (
                        <span className="tabular-nums">
                          <JalaliDate value={n.payload.date} />
                        </span>
                      )}
                      {n.payload?.appointmentId && (
                        <span className="truncate">
                          {t('owner.inbox.refAppointment', { defaultValue: 'نوبت' })}:{' '}
                          <span className="select-all" dir="ltr">
                            {n.payload.appointmentId.slice(0, 8)}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
                {isUnread && (
                  <button
                    type="button"
                    onClick={() => void markOne(n.id)}
                    disabled={busy}
                    aria-label={t('owner.inbox.markRead', {
                      defaultValue: 'علامت‌گذاری به خوانده‌شده',
                    })}
                    title={t('owner.inbox.markRead', { defaultValue: 'علامت‌گذاری به خوانده‌شده' })}
                    className={cn(
                      'inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-xl border border-transparent p-2 text-muted transition-colors hover:border-border hover:bg-elevated hover:text-text',
                      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                    )}
                  >
                    <Check className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </li>
            );
          })}
          </ol>
        </>
      )}

      {status === 'success' && total > NOTIFICATION_PAGE_SIZE && (
        <Pagination
          page={page}
          pageSize={NOTIFICATION_PAGE_SIZE}
          total={total}
          onPageChange={setPage}
          compact
          ariaLabel={t('owner.inbox.paginationLabel', { defaultValue: 'صفحه‌بندی اعلان‌ها' })}
          testId="owner-notifications-pagination"
        />
      )}
    </section>
  );
}

export default OwnerNotificationsPage;
