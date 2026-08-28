import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, Check, CheckCheck, X } from 'lucide-react';
import { inboxApi, type SalonNotification } from '../../api/client';
import { useSalonId } from '../../auth/useSalonId';
import { useInboxWs } from '../../hooks/useInboxWs';
import { Button, Spinner } from '../ui';
import { cn } from '../ui/cn';
import { JalaliDate } from '../ui/JalaliDate';
import { Num } from '../ui/Num';
import { getNotificationDestination } from './notificationDestination';

/** Persian label + iconography for a known notification type. */
function typeIcon(type: string): string {
  if (type.startsWith('booking.')) return '🗓';
  if (type.startsWith('order.')) return '📦';
  if (type.startsWith('subscription.')) return '💳';
  if (type.startsWith('new.')) return '✨';
  return '🔔';
}

/** Format a relative "x دقیقه پیش" / "x ساعت پیش" / date label. */
function relativeTime(
  iso: string,
  t: (k: string, opts?: Record<string, unknown>) => string,
): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = Math.max(0, now - then);
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return t('owner.inbox.justNow', { defaultValue: 'همین الان' });
  if (diffMin < 60) {
    return t('owner.inbox.minAgo', { defaultValue: '{{count}} دقیقه پیش', count: diffMin });
  }
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) {
    return t('owner.inbox.hrAgo', { defaultValue: '{{count}} ساعت پیش', count: diffHr });
  }
  // Day-of label; the absolute date is shown via JalaliDate.
  return '';
}

/**
 * Header bell with unread badge + dropdown panel of recent notifications.
 *
 * Persistent state lives at the page level (`OwnerNotificationsPage`); the bell
 * is purely a quick glance — it polls unread-count on mount and refreshes
 * whenever a WS push arrives. Marking rows read here optimistically bumps the
 * badge down so the owner can clear approvals in a single tap without leaving
 * whatever dashboard page they're on.
 */
export function OwnerInboxBell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const salonId = useSalonId();
  const { lastEvent } = useInboxWs(salonId);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [recent, setRecent] = useState<SalonNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [liveAlert, setLiveAlert] = useState<SalonNotification | null>(null);
  const liveAlertTimerRef = useRef<number | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const readOnOpenRef = useRef(false);

  const refreshAll = useCallback(async () => {
    if (!salonId) return;
    setLoading(true);
    try {
      const [count, list] = await Promise.all([
        inboxApi.unreadCount(salonId),
        inboxApi.list(salonId, { limit: 6 }),
      ]);
      setUnread(count.count);
      setRecent(list.notifications);
    } catch {
      // silent — bell is non-blocking
    } finally {
      setLoading(false);
    }
  }, [salonId]);

  // Initial load.
  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Poll every 60s as a WS fallback (network drop, tab was backgrounded).
  useEffect(() => {
    const id = setInterval(refreshAll, 60_000);
    return () => clearInterval(id);
  }, [refreshAll]);

  // Live event arrived — prepend to the recent list, bump unread, and show
  // an accessible alert even when the notification panel is closed.
  useEffect(() => {
    if (!lastEvent) return;
    setUnread((u) => u + 1);
    setRecent((list) => [lastEvent, ...list.filter((n) => n.id !== lastEvent.id)].slice(0, 6));
    setLiveAlert(lastEvent);
    if (liveAlertTimerRef.current !== null) {
      window.clearTimeout(liveAlertTimerRef.current);
    }
    liveAlertTimerRef.current = window.setTimeout(() => {
      setLiveAlert(null);
      liveAlertTimerRef.current = null;
    }, 6500);

    return () => {
      if (liveAlertTimerRef.current !== null) {
        window.clearTimeout(liveAlertTimerRef.current);
        liveAlertTimerRef.current = null;
      }
    };
  }, [lastEvent]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!anchorRef.current) return;
      if (!anchorRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  const markAll = useCallback(async () => {
    if (!salonId || unread <= 0) return;
    setBusy(true);
    const prev = unread;
    const prevList = recent;
    setUnread(0);
    setRecent((list) => list.map((n) => ({ ...n, readAt: new Date().toISOString() })));
    try {
      await inboxApi.markAllRead(salonId);
    } catch {
      setUnread(prev);
      setRecent(prevList);
    } finally {
      setBusy(false);
    }
  }, [salonId, unread, recent]);

  // If owner opens before the initial count request resolves, wait for that
  // count and still mark the inbox as seen exactly once for this opening.
  useEffect(() => {
    if (!open || !readOnOpenRef.current || unread <= 0 || busy) return;
    readOnOpenRef.current = false;
    void markAll();
  }, [open, unread, busy, markAll]);

  const markOne = useCallback(async (id: string) => {
    setBusy(true);
    setUnread((u) => Math.max(0, u - 1));
    setRecent((list) =>
      list.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
    );
    try {
      await inboxApi.markRead(id);
    } catch {
      setUnread((u) => u + 1);
      setRecent((list) => list.map((n) => (n.id === id ? { ...n, readAt: null } : n)));
    } finally {
      setBusy(false);
    }
  }, []);

  const toggleOpen = () => {
    const nextOpen = !open;
    setOpen(nextOpen);
    // Opening inbox means owner has seen current notifications. The effect
    // waits for the initial unread-count request when needed.
    readOnOpenRef.current = nextOpen;
  };

  const renderedRecent = useMemo(() => {
    if (loading && recent.length === 0) {
      return (
        <div className="flex items-center justify-center py-6">
          <Spinner size="sm" />
        </div>
      );
    }
    if (recent.length === 0) {
      return (
        <p className="py-6 text-center text-sm text-muted">
          {t('owner.inbox.empty', { defaultValue: 'اعلانی نیست' })}
        </p>
      );
    }
    return (
      <ul role="list" className="flex flex-col divide-y divide-border">
        {recent.map((n) => (
          <li
            key={n.id}
            className={cn('flex flex-col gap-1 px-3 py-2.5', !n.readAt && 'bg-primary/5')}
          >
            <div className="flex items-start gap-2">
              <Link
                to={getNotificationDestination(n)}
                onClick={() => {
                  if (!n.readAt) void markOne(n.id);
                  setOpen(false);
                }}
                className={cn(
                  'flex min-w-0 flex-1 items-start gap-2 rounded-md text-start no-underline',
                  'transition-colors hover:bg-elevated/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus',
                )}
                aria-label={n.title}
              >
                <span className="mt-0.5 text-base leading-none">{typeIcon(n.type)}</span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-text">{n.title}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted">{n.body}</p>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[0.65rem] text-muted/70">
                    <Num value={relativeTime(n.createdAt, t)} />
                    {n.payload?.date && (
                      <span className="tabular-nums">
                        <JalaliDate value={n.payload.date} />
                      </span>
                    )}
                  </div>
                </div>
              </Link>
              {!n.readAt && (
                <button
                  type="button"
                  onClick={() => void markOne(n.id)}
                  disabled={busy}
                  aria-label={t('owner.inbox.markRead', {
                    defaultValue: 'علامت‌گذاری به خوانده‌شده',
                  })}
                  className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded p-1 text-muted hover:bg-elevated hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                >
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    );
  }, [recent, loading, busy, markOne, t]);

  return (
    <div ref={anchorRef} className="relative">
      {liveAlert && (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          data-testid="owner-live-alert"
          className={cn(
            'fixed inset-x-3 top-[4.5rem] z-toast mx-auto flex w-auto max-w-sm items-start gap-3',
            'rounded-xl border border-primary/30 bg-surface p-3 shadow-3',
            'sm:inset-x-auto sm:end-4 sm:top-20 sm:mx-0 sm:w-[22rem]',
          )}
        >
          <span className="mt-0.5 text-lg leading-none" aria-hidden="true">
            {typeIcon(liveAlert.type)}
          </span>
          <Link
            to={getNotificationDestination(liveAlert)}
            onClick={() => {
              if (!liveAlert.readAt) void markOne(liveAlert.id);
              setLiveAlert(null);
              setOpen(false);
            }}
            className="min-w-0 flex-1 rounded-md text-start no-underline hover:bg-elevated/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
            aria-label={liveAlert.title}
          >
            <strong className="block truncate text-sm text-text">{liveAlert.title}</strong>
            <p className="mt-1 line-clamp-2 text-xs text-muted">{liveAlert.body}</p>
          </Link>
          <button
            type="button"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted hover:bg-elevated hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
            aria-label="بستن اعلان"
            onClick={() => setLiveAlert(null)}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={toggleOpen}
        aria-label={t('owner.inbox.bell', { defaultValue: 'اعلان‌ها' })}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          'relative inline-flex h-11 w-11 items-center justify-center rounded-md',
          'text-text hover:bg-elevated',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        )}
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className={cn(
              'absolute -top-0.5 -end-0.5 flex h-4 min-w-4 items-center justify-center',
              'rounded-full bg-danger px-1 text-[0.6rem] font-bold text-danger-contrast',
              'tabular-nums',
            )}
          >
            <Num value={unread > 99 ? '۹۹+' : unread} />
          </span>
        )}
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="بستن اعلان‌ها"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-sticky bg-bg/40 backdrop-blur-[1px] sm:hidden"
          />
          <div
            role="dialog"
            aria-label={t('owner.inbox.bell', { defaultValue: 'اعلان‌ها' })}
            className={cn(
              'fixed inset-x-3 top-[4.5rem] z-nav flex max-h-[calc(100dvh-7.5rem)] flex-col overflow-hidden',
              'rounded-xl border border-border bg-surface shadow-3',
              'sm:absolute sm:inset-x-auto sm:end-0 sm:top-full sm:mt-2 sm:w-[22rem] sm:max-w-[calc(100vw-1rem)] sm:max-h-[min(36rem,calc(100dvh-7rem))]',
            )}
          >
            <header className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-sm font-semibold text-text">
                {t('owner.inbox.title', { defaultValue: 'اعلان‌ها' })}
                {unread > 0 && (
                  <span className="ms-1 text-xs text-muted">
                    (<Num value={unread} />)
                  </span>
                )}
              </span>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={markAll}
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs font-medium text-primary hover:bg-primary/10"
                >
                  <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('owner.inbox.markAllRead', { defaultValue: 'خواندن همه' })}
                </button>
              )}
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{renderedRecent}</div>
            <footer className="border-t border-border p-2">
              <Button
                variant="ghost"
                size="md"
                onClick={() => {
                  setOpen(false);
                  navigate('/owner/notifications');
                }}
                className="w-full"
              >
                {t('owner.inbox.viewAll', { defaultValue: 'نمایش همه' })}
              </Button>
            </footer>
          </div>
        </>
      )}
    </div>
  );
}
