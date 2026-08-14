import { useCallback, useEffect, useState } from 'react';

/**
 * The non-standard (but widely shipped on Chromium) `beforeinstallprompt`
 * event. We capture it so we can offer an in-page "افزودن به‌عنوان وب‌اپ"
 * (add as web app) action at a moment of intent, instead of relying on the
 * browser's mini-infobar.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface PwaInstall {
  /** True when the app is already running installed (standalone display). */
  installed: boolean;
  /** True when the browser fired `beforeinstallprompt` and we can prompt now. */
  canPrompt: boolean;
  /**
   * Trigger the native install prompt. Resolves to the user's choice, or
   * `unavailable` when no deferred prompt exists (e.g. iOS Safari, which needs
   * the manual Share → "Add to Home Screen" flow).
   */
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
}

/** Detects whether the document is running as an installed/standalone PWA. */
function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const mql =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  // iOS Safari exposes the legacy `navigator.standalone` flag instead.
  const iosStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return Boolean(mql || iosStandalone);
}

/**
 * Hook powering the "add as web app" affordance (PWA install). It captures the
 * deferred `beforeinstallprompt` event, tracks whether the app is already
 * installed, and exposes a `promptInstall()` to fire the native prompt on a
 * user gesture. Safe in non-browser/SSR and on browsers that never fire the
 * event (the caller falls back to manual instructions).
 */
export function usePwaInstall(): PwaInstall {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState<boolean>(() => detectStandalone());

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onBeforeInstall = (event: Event) => {
      // Suppress the default mini-infobar so we control the moment of offer.
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferred) return 'unavailable';
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    // A deferred prompt can only be used once.
    setDeferred(null);
    if (outcome === 'accepted') setInstalled(true);
    return outcome;
  }, [deferred]);

  return { installed, canPrompt: deferred !== null, promptInstall };
}
