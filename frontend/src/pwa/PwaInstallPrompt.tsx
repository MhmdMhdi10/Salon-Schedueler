import { useEffect, useState } from 'react';
import { Download, Smartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../components/ui';
import { usePwaInstall } from './usePwaInstall';

const DISMISS_KEY = 'ara-pwa-install-prompt-dismissed-v1';
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

function wasDismissedRecently(): boolean {
  try {
    const value = Number(window.localStorage.getItem(DISMISS_KEY));
    return Number.isFinite(value) && Date.now() - value < DISMISS_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function rememberDismissal(): void {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // Private browsing or blocked storage should never break the install CTA.
  }
}

function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/**
 * First-visit PWA invitation for public app-shell pages.
 *
 * Browsers do not allow `beforeinstallprompt.prompt()` without a user gesture,
 * so the dialog opens automatically and the primary button triggers the native
 * browser install sheet. Safari/iOS falls back to concise manual instructions.
 */
export function PwaInstallPrompt() {
  const { t } = useTranslation();
  const { installed, canPrompt, promptInstall } = usePwaInstall();
  const [open, setOpen] = useState(false);
  const [showManualHelp, setShowManualHelp] = useState(false);
  const [ios] = useState(isIosDevice);

  useEffect(() => {
    if (installed || wasDismissedRecently()) return;
    const timer = window.setTimeout(() => setOpen(true), 350);
    return () => window.clearTimeout(timer);
  }, [installed]);

  useEffect(() => {
    if (installed) setOpen(false);
  }, [installed]);

  const dismiss = () => {
    rememberDismissal();
    setOpen(false);
  };

  const handleInstall = async () => {
    const outcome = await promptInstall();
    if (outcome === 'accepted') {
      setOpen(false);
    } else if (outcome === 'dismissed') {
      dismiss();
    } else {
      setShowManualHelp(true);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) setOpen(true);
        else dismiss();
      }}
    >
      <DialogContent className="p-5 sm:p-6">
        <div className="flex items-start gap-3 pe-8">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-pill bg-primary/10 text-primary"
            aria-hidden="true"
          >
            <Smartphone className="h-6 w-6" />
          </div>
          <div>
            <DialogTitle>{t('app.pwaInstall.title')}</DialogTitle>
            <DialogDescription>{t('app.pwaInstall.description')}</DialogDescription>
          </div>
        </div>

        <ul className="mt-5 grid gap-2 text-sm text-muted">
          <li className="flex items-center gap-2 rounded-md bg-surface px-3 py-2">
            <span className="text-primary" aria-hidden="true">✓</span>
            {t('app.pwaInstall.benefitFast')}
          </li>
          <li className="flex items-center gap-2 rounded-md bg-surface px-3 py-2">
            <span className="text-primary" aria-hidden="true">✓</span>
            {t('app.pwaInstall.benefitApp')}
          </li>
        </ul>

        {showManualHelp && (
          <p role="note" className="mt-4 rounded-md border border-border bg-surface px-3 py-2 text-xs leading-6 text-muted">
            <span className="font-semibold text-text">{t('app.pwaInstall.manualTitle')}: </span>
            {ios ? t('app.pwaInstall.iosInstructions') : t('app.pwaInstall.manualInstructions')}
          </p>
        )}

        <div className="mt-5 grid gap-2">
          <Button size="lg" fullWidth onClick={() => void handleInstall()} startIcon={<Download className="h-4 w-4" />}>
            {canPrompt ? t('app.pwaInstall.install') : t('app.pwaInstall.showInstructions')}
          </Button>
          <Button variant="ghost" fullWidth onClick={dismiss}>
            {t('app.pwaInstall.later')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default PwaInstallPrompt;
