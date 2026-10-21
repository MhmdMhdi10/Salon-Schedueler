import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui';
import { registerFirebaseWebPushToken } from '../lib/firebase-messaging';

export type BrowserNotificationPermission = NotificationPermission | 'unsupported';

/**
 * Read the browser notification state without touching the permission prompt.
 * The prompt itself must be triggered by a user action, so the app only calls
 * `requestBrowserNotificationPermission` from the dialog button below.
 */
export function getBrowserNotificationPermission(): BrowserNotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }

  // Notification permission is only meaningful in a secure context. Browsers
  // treat localhost as trustworthy; an undefined value keeps older embedded
  // browsers and jsdom usable without weakening real HTTPS checks.
  if (typeof window.isSecureContext === 'boolean' && !window.isSecureContext) {
    return 'unsupported';
  }

  return window.Notification.permission;
}

/** Request permission after an explicit click on the app's enable button. */
export async function requestBrowserNotificationPermission(): Promise<BrowserNotificationPermission> {
  const current = getBrowserNotificationPermission();
  if (current !== 'default') return current;

  try {
    return await window.Notification.requestPermission();
  } catch {
    return getBrowserNotificationPermission();
  }
}

function isOwnerSurface(pathname: string): boolean {
  return pathname === '/owner' || pathname.startsWith('/owner/');
}

/**
 * App-open notification permission invitation for authenticated customer and
 * salon-panel surfaces. It explains the benefit first, then lets the user's
 * click invoke the native browser permission prompt.
 */
export function NotificationPermissionPrompt() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { status, principal, isStaff, isPlatformAdmin } = useAuth();
  const [permission, setPermission] = useState<BrowserNotificationPermission>(() =>
    getBrowserNotificationPermission(),
  );
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const eligible =
    status === 'authenticated' &&
    (pathname === '/account' || (isOwnerSurface(pathname) && (isStaff || isPlatformAdmin)));

  useEffect(() => {
    if (!eligible || dismissed) {
      setOpen(false);
      return;
    }

    const nextPermission = getBrowserNotificationPermission();
    setPermission(nextPermission);
    if (nextPermission !== 'default') {
      setOpen(false);
      if (nextPermission === 'granted') {
        void registerFirebaseWebPushToken(principal?.id);
      }
      return;
    }

    // Let the authenticated surface render first, then show the explainer.
    // The native permission dialog still waits for the explicit button click.
    const timer = window.setTimeout(() => setOpen(true), 250);
    return () => window.clearTimeout(timer);
  }, [dismissed, eligible, principal?.id]);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const syncPermission = () => {
      const nextPermission = getBrowserNotificationPermission();
      setPermission(nextPermission);
      if (nextPermission !== 'default') setOpen(false);
    };

    document.addEventListener('visibilitychange', syncPermission);
    return () => document.removeEventListener('visibilitychange', syncPermission);
  }, []);

  const dismiss = () => {
    setDismissed(true);
    setOpen(false);
  };

  const enableNotifications = async () => {
    setBusy(true);
    const nextPermission = await requestBrowserNotificationPermission();
    setPermission(nextPermission);
    if (nextPermission === 'granted') {
      void registerFirebaseWebPushToken(principal?.id);
    }
    setBusy(false);
    setDismissed(true);
    setOpen(false);
  };

  if (!eligible || permission !== 'default' || !open) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) dismiss();
      }}
    >
      <DialogContent
        data-testid="notification-permission-dialog"
        closeLabel={t('app.notifications.close')}
        className="p-5 sm:p-6"
      >
        <div className="flex items-start gap-3 pe-8">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-pill bg-primary/10 text-primary"
            aria-hidden="true"
          >
            <Bell className="h-6 w-6" />
          </div>
          <div>
            <DialogTitle className="text-lg font-bold">{t('app.notifications.title')}</DialogTitle>
            <DialogDescription className="leading-6">
              {t('app.notifications.description')}
            </DialogDescription>
          </div>
        </div>

        <ul className="mt-5 grid gap-2 text-sm text-muted">
          <li className="flex items-start gap-2 rounded-md bg-surface px-3 py-2 leading-6">
            <span className="text-primary" aria-hidden="true">
              ✓
            </span>
            {t('app.notifications.bookingUpdates')}
          </li>
          <li className="flex items-start gap-2 rounded-md bg-surface px-3 py-2 leading-6">
            <span className="text-primary" aria-hidden="true">
              ✓
            </span>
            {t('app.notifications.reminders')}
          </li>
        </ul>

        <p
          role="note"
          className="mt-4 rounded-md border border-border bg-surface px-3 py-2 text-xs leading-6 text-muted"
        >
          {t('app.notifications.browserHint')}
        </p>

        <div className="mt-5 grid gap-2">
          <Button
            size="lg"
            fullWidth
            loading={busy}
            onClick={() => void enableNotifications()}
            startIcon={<Bell className="h-4 w-4" />}
          >
            {t('app.notifications.enable')}
          </Button>
          <Button variant="ghost" fullWidth onClick={dismiss} disabled={busy}>
            {t('app.notifications.later')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default NotificationPermissionPrompt;
