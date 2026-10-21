import {
  getApp,
  getApps,
  initializeApp,
  type FirebaseApp,
  type FirebaseOptions,
} from 'firebase/app';
import { getAnalytics, isSupported, type Analytics } from 'firebase/analytics';

/**
 * Firebase web configuration is public app metadata, but keeping it in Vite
 * variables lets each environment choose its own Firebase project without
 * rebuilding application code.
 */
const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const hasRequiredConfig = [
  firebaseConfig.apiKey,
  firebaseConfig.authDomain,
  firebaseConfig.projectId,
  firebaseConfig.storageBucket,
  firebaseConfig.messagingSenderId,
  firebaseConfig.appId,
].every((value) => typeof value === 'string' && value.trim() !== '');

/** Null means Firebase is intentionally disabled for an unconfigured environment. */
export const firebaseApp: FirebaseApp | null = hasRequiredConfig
  ? getApps().length > 0
    ? getApp()
    : initializeApp(firebaseConfig)
  : null;

/** Public Web Push certificate used to create browser FCM registration tokens. */
export const firebaseVapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY?.trim() || null;

/**
 * Analytics is opt-in at runtime and unsupported browsers are ignored. The
 * promise also prevents an analytics capability error from blocking app boot.
 */
export const firebaseAnalytics: Promise<Analytics | null> =
  firebaseApp && typeof window !== 'undefined'
    ? isSupported()
        .then((supported) => (supported ? getAnalytics(firebaseApp) : null))
        .catch(() => null)
    : Promise.resolve(null);
