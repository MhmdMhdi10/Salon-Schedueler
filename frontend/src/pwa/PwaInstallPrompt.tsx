import { useEffect, useState } from 'react';
import { Download, Smartphone } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  cn,
} from '../components/ui';
import { usePwaInstall, type PwaInstallPlatform } from './usePwaInstall';

const instructionKeys: Record<PwaInstallPlatform, string> = {
  ios: 'ios',
  android: 'android',
  'android-samsung': 'androidSamsung',
  'android-firefox': 'androidFirefox',
  'desktop-chromium': 'desktopChromium',
  'desktop-safari': 'desktopSafari',
  other: 'other',
};

/**
 * PWA invitation shown on the landing page.
 *
 * Browsers do not allow `beforeinstallprompt.prompt()` without a user gesture,
 * so the floating CTA triggers the native browser install sheet directly when
 * available. Browsers without that event get device-specific manual instructions
 * after the user opens the CTA.
 */
export function PwaInstallPrompt() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { installed, canPrompt, secureContext, platform, promptInstall } = usePwaInstall();
  const [open, setOpen] = useState(false);
  const [showManualHelp, setShowManualHelp] = useState(false);
  const isRegistrationRoute = pathname === '/business/register';

  const instructions = t(`app.pwaInstall.instructions.${instructionKeys[platform]}`, {
    returnObjects: true,
  }) as unknown as { title: string; steps: string[] };

  useEffect(() => {
    if (installed) setOpen(false);
  }, [installed]);

  const dismiss = () => setOpen(false);

  const handleInstallButtonClick = async () => {
    if (canPrompt) {
      const outcome = await promptInstall();
      if (outcome === 'unavailable') {
        setShowManualHelp(true);
        setOpen(true);
      }
      return;
    }

    setShowManualHelp(true);
    setOpen(true);
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
    <>
      {!installed && (
        <div
          className={cn(
            'pointer-events-none fixed inset-x-3 bottom-3 z-nav flex justify-end pb-[env(safe-area-inset-bottom)] sm:end-5 sm:bottom-5 sm:inset-x-auto',
            isRegistrationRoute && 'max-sm:hidden',
          )}
        >
          <Button
            className="pointer-events-auto shadow-2"
            onClick={() => void handleInstallButtonClick()}
            startIcon={<Download className="h-4 w-4" />}
            aria-haspopup={canPrompt ? undefined : 'dialog'}
          >
            {t('app.pwaInstall.openButton')}
          </Button>
        </div>
      )}

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
              <span className="text-primary" aria-hidden="true">
                ✓
              </span>
              {t('app.pwaInstall.benefitFast')}
            </li>
            <li className="flex items-center gap-2 rounded-md bg-surface px-3 py-2">
              <span className="text-primary" aria-hidden="true">
                ✓
              </span>
              {t('app.pwaInstall.benefitApp')}
            </li>
          </ul>

          <p
            role="note"
            className="mt-4 rounded-md border border-border bg-surface px-3 py-2 text-xs leading-6 text-muted"
          >
            {secureContext
              ? canPrompt
                ? t('app.pwaInstall.nativeHint')
                : t('app.pwaInstall.manualHint')
              : t('app.pwaInstall.secureContextRequired')}
          </p>

          {secureContext && !canPrompt && platform === 'android' && (
            <p role="note" className="mt-3 text-xs leading-6 text-muted">
              {t('app.pwaInstall.androidPromptHint')}
            </p>
          )}

          {secureContext && (!canPrompt || showManualHelp) && (
            <div className="mt-4 rounded-md border border-border bg-surface px-3 py-3 text-sm text-muted">
              <p className="font-semibold text-text">{instructions.title}</p>
              <ol className="mt-2 grid list-decimal gap-1.5 ps-5 leading-6">
                {instructions.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          )}

          {secureContext && canPrompt && !showManualHelp && (
            <button
              type="button"
              className="mt-3 text-start text-xs font-medium text-primary underline-offset-2 hover:underline"
              onClick={() => setShowManualHelp(true)}
            >
              {t('app.pwaInstall.showManualHelp')}
            </button>
          )}

          <div className="mt-5 grid gap-2">
            {canPrompt && (
              <Button
                size="lg"
                fullWidth
                onClick={() => void handleInstall()}
                startIcon={<Download className="h-4 w-4" />}
              >
                {t('app.pwaInstall.install')}
              </Button>
            )}
            <Button variant="ghost" fullWidth onClick={dismiss}>
              {t('app.pwaInstall.later')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default PwaInstallPrompt;
