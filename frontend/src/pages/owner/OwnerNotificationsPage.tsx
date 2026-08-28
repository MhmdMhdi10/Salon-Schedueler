import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Check, CheckCheck, Bell } from 'lucide-react';
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

function typeIcon(type: string): string {
  if (type.startsWith('booking.')) return '🗓';
  if (type.startsWith('order.')) return '📦';
  if (type.startsWith('subscription.')) return '💳';
  if (type.startsWith('new.')) return '✨';
  return '🔔';
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
  const { lastEvent, connected } = useInboxWs(salonId);
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
  }, [salonId, filter, page, reloadToken, t]);

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
    <section data-testid="owner-notifications-page" className="flex flex-col gap-5">
      <SeoHead title={t('owner.inbox.pageTitle', { defaultValue: 'اعلان‌ها' })} />

      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" aria-hidden="true" />
          <h1 className="text-xl text-display text-text">
            {t('owner.inbox.pageTitle', { defaultValue: 'اعلان‌ها' })}
          </h1>
          {connected && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[0.65rem] font-medium text-success"
              aria-label={t('owner.inbox.live', { defaultValue: 'اتصال زنده' })}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              {t('owner.inbox.live', { defaultValue: 'زنده' })}
            </span>
          )}
        </div>
        <p className="text-sm text-muted">
          {t('owner.inbox.subtitle', {
            defaultValue: 'آخرین رویدادهای سالن — نوبت‌ها، سفارش‌ها و ...',
          })}
        </p>
      </header>

      {/* Toolbar: filter tabs + mark-all */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" className="inline-flex rounded-lg border border-border bg-bg p-1">
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'all'}
            onClick={() => {
              setPage(1);
              setFilter('all');
            }}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium',
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
              'rounded-md px-3 py-1.5 text-sm font-medium',
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
          <Button variant="secondary" size="md" onClick={markAll} disabled={busy}>
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
          className="flex flex-col items-center gap-2 rounded-lg border border-border bg-surface p-10 text-center"
        >
          <span className="text-3xl">🔔</span>
          <p className="text-sm text-muted">
            {filter === 'unread'
              ? t('owner.inbox.noUnread', { defaultValue: 'اعلان خوانده‌نشده‌ای نیست' })
              : t('owner.inbox.empty', { defaultValue: 'اعلانی نیست' })}
          </p>
        </div>
      )}

      {status === 'success' && items.length > 0 && (
        <ol data-testid="owner-notifications-list" className="flex flex-col gap-2">
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
          {items.map((n) => {
            const isUnread = !n.readAt;
            return (
              <li
                key={n.id}
                className={cn(
                  'flex items-start gap-3 rounded-lg border p-3',
                  isUnread ? 'border-primary/40 bg-primary/5' : 'border-border bg-surface',
                )}
              >
                <Link
                  to={getNotificationDestination(n)}
                  onClick={() => {
                    if (isUnread) void markOne(n.id);
                  }}
                  className="flex min-w-0 flex-1 items-start gap-3 rounded-md text-start no-underline transition-colors hover:bg-elevated/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                  aria-label={n.title}
                >
                  <span className="mt-0.5 text-base">{typeIcon(n.type)}</span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-text">{n.title}</span>
                      <span className="shrink-0 text-[0.65rem] tabular-nums text-muted">
                        <Num value={relativeTime(n.createdAt, t)} />
                      </span>
                    </div>
                    <p className="text-xs text-muted">{n.body}</p>
                    <div className="flex items-center gap-3 text-[0.65rem] text-muted">
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
                    className={cn(
                      'inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-md p-2 text-muted hover:bg-elevated hover:text-text',
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
