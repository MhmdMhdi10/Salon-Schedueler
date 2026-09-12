import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, CheckCheck } from 'lucide-react';
import { customerApi, type CustomerNotification } from '../../api/client';
import {
  CUSTOMER_NOTIFICATIONS_CHANGED,
  announceCustomerNotificationsChanged,
} from '../../utils/customerNotifications';
import { Button, JalaliDate, Num, Spinner } from '../ui';
import { cn } from '../ui/cn';

function typeIcon(type: string): string {
  if (type.startsWith('booking.')) return '🗓';
  if (type.startsWith('waitlist.')) return '⏱';
  if (type.startsWith('payment.')) return '💳';
  return '🔔';
}

function relativeTime(iso: string): string {
  const createdAt = new Date(iso).getTime();
  if (Number.isNaN(createdAt)) return '';
  const diffMin = Math.max(0, Math.floor((Date.now() - createdAt) / 60_000));
  if (diffMin < 1) return 'همین الان';
  if (diffMin < 60) return `${diffMin} دقیقه پیش`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} ساعت پیش`;
  return '';
}

/** Customer account notification bell shown in the `/account` header. */
export function CustomerInboxBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<CustomerNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const readOnOpenRef = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await customerApi.getNotifications();
      setNotifications(response.notifications ?? []);
    } catch {
      // The header bell is non-blocking; the account page remains usable.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    const handleChanged = () => void refresh();
    window.addEventListener('storage', handleChanged);
    window.addEventListener(CUSTOMER_NOTIFICATIONS_CHANGED, handleChanged);
    return () => {
      window.removeEventListener('storage', handleChanged);
      window.removeEventListener(CUSTOMER_NOTIFICATIONS_CHANGED, handleChanged);
    };
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (!anchorRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, [open]);

  const unread = useMemo(
    () => notifications.reduce((count, notification) => count + (notification.readAt ? 0 : 1), 0),
    [notifications],
  );

  const markOne = useCallback(async (id: string) => {
    const previous = notifications;
    setBusy(true);
    setNotifications((current) =>
      current.map((notification) =>
        notification.id === id
          ? { ...notification, readAt: notification.readAt ?? new Date().toISOString() }
          : notification,
      ),
    );
    try {
      await customerApi.markNotificationRead(id);
      announceCustomerNotificationsChanged();
    } catch {
      setNotifications(previous);
    } finally {
      setBusy(false);
    }
  }, [notifications]);

  const markAll = useCallback(async () => {
    if (unread <= 0) return;
    const previous = notifications;
    setBusy(true);
    setNotifications((current) =>
      current.map((notification) => ({
        ...notification,
        readAt: notification.readAt ?? new Date().toISOString(),
      })),
    );
    try {
      await customerApi.markAllNotificationsRead();
      announceCustomerNotificationsChanged();
    } catch {
      setNotifications(previous);
    } finally {
      setBusy(false);
    }
  }, [notifications, unread]);

  // Opening the inbox marks current notifications as seen, matching the salon
  // panel. Wait for the initial list request when the bell is clicked first.
  useEffect(() => {
    if (!open || !readOnOpenRef.current || unread <= 0 || busy) return;
    readOnOpenRef.current = false;
    void markAll();
  }, [open, unread, busy, markAll]);

  const toggleOpen = () => {
    const nextOpen = !open;
    setOpen(nextOpen);
    readOnOpenRef.current = nextOpen;
  };

  const recent = notifications.slice(0, 8);
  const renderedNotifications = useMemo(() => {
    if (loading && recent.length === 0) {
      return (
        <div className="flex items-center justify-center py-7">
          <Spinner size="sm" />
        </div>
      );
    }
    if (recent.length === 0) {
      return <p className="py-7 text-center text-sm text-muted">اعلانی نیست</p>;
    }
    return (
      <ul role="list" className="flex flex-col divide-y divide-border">
        {recent.map((notification) => {
          const relative = relativeTime(notification.createdAt);
          return (
            <li
              key={notification.id}
              className={cn('flex flex-col gap-1 px-3 py-2.5', !notification.readAt && 'bg-primary/5')}
            >
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (!notification.readAt) void markOne(notification.id);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex min-w-0 flex-1 items-start gap-2 rounded-md text-start',
                    'hover:bg-elevated/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus',
                  )}
                  aria-label={notification.title}
                >
                  <span className="mt-0.5 text-base leading-none" aria-hidden="true">
                    {typeIcon(notification.type)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <strong className="truncate text-sm font-semibold text-text">
                      {notification.title}
                    </strong>
                    <span className="mt-0.5 line-clamp-2 text-xs text-muted">
                      {notification.body}
                    </span>
                    <span className="mt-1 flex items-center gap-2 text-[0.65rem] text-muted/70">
                      {relative ? <Num value={relative} /> : <JalaliDate value={notification.createdAt} variant="numeric" />}
                    </span>
                  </span>
                </button>
                {!notification.readAt && (
                  <button
                    type="button"
                    onClick={() => void markOne(notification.id)}
                    disabled={busy}
                    aria-label="علامت‌گذاری به خوانده‌شده"
                    className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded p-1 text-muted hover:bg-elevated hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    );
  }, [busy, loading, markOne, recent]);

  return (
    <div ref={anchorRef} className="relative" data-testid="customer-notifications-header">
      <button
        type="button"
        onClick={toggleOpen}
        aria-label="اعلان‌های حساب کاربری"
        aria-expanded={open}
        aria-haspopup="dialog"
        data-testid="customer-notifications-bell"
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
            className="absolute -top-0.5 -end-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[0.6rem] font-bold text-danger-contrast tabular-nums"
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
            aria-label="اعلان‌های حساب کاربری"
            data-testid="customer-notifications-popover"
            className={cn(
              'fixed inset-x-3 top-[4.5rem] z-nav flex max-h-[calc(100dvh-7.5rem)] flex-col overflow-hidden',
              'rounded-xl border border-border bg-surface shadow-3',
              'sm:absolute sm:inset-x-auto sm:end-0 sm:top-full sm:mt-2 sm:w-[22rem] sm:max-w-[calc(100vw-1rem)] sm:max-h-[min(36rem,calc(100dvh-7rem))]',
            )}
          >
            <header className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-sm font-semibold text-text">
                اعلان‌های من
                {unread > 0 && <span className="ms-1 text-xs text-muted">(<Num value={unread} />)</span>}
              </span>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={() => void markAll()}
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs font-medium text-primary hover:bg-primary/10"
                >
                  <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  خواندن همه
                </button>
              )}
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {renderedNotifications}
            </div>
            <footer className="border-t border-border p-2">
              <Button
                variant="ghost"
                size="md"
                onClick={() => {
                  setOpen(false);
                  navigate('/account#customer-notifications');
                }}
                className="w-full"
              >
                نمایش همه پیام‌ها
              </Button>
            </footer>
          </div>
        </>
      )}
    </div>
  );
}

export default CustomerInboxBell;
