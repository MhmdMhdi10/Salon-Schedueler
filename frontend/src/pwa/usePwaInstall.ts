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

type BeforeInstallPromptListener = (event: BeforeInstallPromptEvent) => void;

// Register at module load, before React effects run. Chrome may dispatch
// `beforeinstallprompt` while the route tree is still loading; keeping one
// module-level copy prevents that event from being lost between prerender,
// lazy-route resolution, and the install component mounting.
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let promptListenerAttached = false;
const promptListeners = new Set<BeforeInstallPromptListener>();

function captureBeforeInstallPrompt(event: Event): void {
  const candidate = event as Partial<BeforeInstallPromptEvent>;
  if (typeof candidate.prompt !== 'function' || !candidate.userChoice) return;
  event.preventDefault();
  deferredPrompt = candidate as BeforeInstallPromptEvent;
  promptListeners.forEach((listener) => listener(deferredPrompt!));
}

function attachBeforeInstallPromptListener(): void {
  if (promptListenerAttached || typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', captureBeforeInstallPrompt);
  promptListenerAttached = true;
}

function clearDeferredPrompt(): void {
  deferredPrompt = null;
}

attachBeforeInstallPromptListener();

export type PwaInstallPlatform =
  | 'ios'
  | 'android'
  | 'android-samsung'
  | 'android-firefox'
  | 'desktop-chromium'
  | 'desktop-safari'
  | 'other';

export interface PwaInstall {
  /** True when the app is already running installed (standalone display). */
  installed: boolean;
  /** True when the browser fired `beforeinstallprompt` and we can prompt now. */
  canPrompt: boolean;
  /** True when the page is served from a browser-trusted secure context. */
  secureContext: boolean;
  /** Best-effort browser/device family used to tailor manual instructions. */
  platform: PwaInstallPlatform;
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
 * Return a small platform set for human-readable install instructions.
 * iPadOS reports a desktop Mac user agent, so touch points are part of the
 * iOS check. Browser-specific Android tokens are checked before generic Chrome.
 */
export function getPwaInstallPlatform(userAgent?: string): PwaInstallPlatform {
  if (typeof navigator === 'undefined' && userAgent === undefined) return 'other';

  const ua = (userAgent ?? navigator.userAgent).toLowerCase();
  const isIpadOs =
    /macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1;

  if (/iphone|ipad|ipod/.test(ua) || isIpadOs) return 'ios';
  if (/android/.test(ua)) {
    if (/samsungbrowser/.test(ua)) return 'android-samsung';
    if (/firefox/.test(ua)) return 'android-firefox';
    return 'android';
  }
  if (/edg|chrome|chromium|crios|opr\//.test(ua)) return 'desktop-chromium';
  if (/safari/.test(ua)) return 'desktop-safari';
  return 'other';
}

function detectSecureContext(): boolean {
  if (typeof window === 'undefined') return false;
  // jsdom and older embedded browsers may not expose `isSecureContext`; the
  // browser install event remains the source of truth in those environments.
  return typeof window.isSecureContext === 'boolean' ? window.isSecureContext : true;
}

/**
 * Hook powering the "add as web app" affordance (PWA install). It captures the
 * deferred `beforeinstallprompt` event, tracks whether the app is already
 * installed, and exposes a `promptInstall()` to fire the native prompt on a
 * user gesture. Safe in non-browser/SSR and on browsers that never fire the
 * event (the caller falls back to manual instructions).
 */
export function usePwaInstall(): PwaInstall {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(() => deferredPrompt);
  const [installed, setInstalled] = useState<boolean>(() => detectStandalone());
  const [secureContext] = useState<boolean>(() => detectSecureContext());
  const [platform] = useState<PwaInstallPlatform>(() => getPwaInstallPlatform());

  useEffect(() => {
    if (typeof window === 'undefined') return;

    attachBeforeInstallPromptListener();
    const onBeforeInstall = (event: BeforeInstallPromptEvent) => setDeferred(event);
    const onInstalled = () => {
      setInstalled(true);
      clearDeferredPrompt();
      setDeferred(null);
    };
    const refreshStandalone = () => setInstalled(detectStandalone());

    promptListeners.add(onBeforeInstall);
    if (deferredPrompt) setDeferred(deferredPrompt);
    window.addEventListener('appinstalled', onInstalled);
    document.addEventListener('visibilitychange', refreshStandalone);

    // iOS does not reliably emit `appinstalled`; display-mode changes and a
    // visibility return let manual installs close the CTA when the app opens.
    const displayMode = window.matchMedia?.('(display-mode: standalone)');
    if (displayMode?.addEventListener) {
      displayMode.addEventListener('change', refreshStandalone);
    } else {
      displayMode?.addListener?.(refreshStandalone);
    }

    return () => {
      promptListeners.delete(onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      document.removeEventListener('visibilitychange', refreshStandalone);
      if (displayMode?.removeEventListener) {
        displayMode.removeEventListener('change', refreshStandalone);
      } else {
        displayMode?.removeListener?.(refreshStandalone);
      }
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferred) return 'unavailable';
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      // A deferred prompt can only be used once.
      clearDeferredPrompt();
      setDeferred(null);
      if (outcome === 'accepted') setInstalled(true);
      return outcome;
    } catch {
      // Browser policy, an expired event, or a blocked install must never leave
      // the CTA stuck in a loading/error state; the caller shows manual help.
      clearDeferredPrompt();
      setDeferred(null);
      return 'unavailable';
    }
  }, [deferred]);

  return {
    installed,
    canPrompt: deferred !== null,
    secureContext,
    platform,
    promptInstall,
  };
}
