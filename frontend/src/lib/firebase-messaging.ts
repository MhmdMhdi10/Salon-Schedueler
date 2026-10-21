import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { deviceApi } from '../api/client';
import { firebaseApp, firebaseVapidKey } from './firebase';

let registrationInFlight: Promise<string | null> | null = null;
let registeredSession: { id: string | null; token: string } | null = null;

async function getPushServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing) return existing;

  // Production registers the worker during app bootstrap. Give that startup
  // registration a short window, but never let local development wait forever.
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 5_000)),
  ]);
}

/**
 * Register this browser's FCM token with Ara after browser permission has been
 * granted. Missing Firebase/VAPID/service-worker support is intentionally a
 * no-op so the regular web app remains usable in development and unsupported
 * browsers.
 */
export function registerFirebaseWebPushToken(sessionId?: string): Promise<string | null> {
  if (registeredSession?.id === (sessionId ?? null)) {
    return Promise.resolve(registeredSession.token);
  }
  if (registrationInFlight) return registrationInFlight;

  registrationInFlight = (async () => {
    if (
      !firebaseApp ||
      !firebaseVapidKey ||
      typeof window === 'undefined' ||
      !('Notification' in window) ||
      window.Notification.permission !== 'granted' ||
      !('serviceWorker' in navigator)
    ) {
      return null;
    }

    if (!(await isSupported())) return null;

    const serviceWorkerRegistration = await getPushServiceWorkerRegistration();
    if (!serviceWorkerRegistration) return null;

    const messaging = getMessaging(firebaseApp);
    const token = await getToken(messaging, {
      vapidKey: firebaseVapidKey,
      serviceWorkerRegistration,
    });
    if (!token) return null;

    await deviceApi.registerToken(token, 'web');
    registeredSession = { id: sessionId ?? null, token };
    return token;
  })()
    .catch(() => null)
    .finally(() => {
      registrationInFlight = null;
    });

  return registrationInFlight;
}
