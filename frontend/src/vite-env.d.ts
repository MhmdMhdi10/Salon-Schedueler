/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the Salon Booking System HTTP API (see src/api/client.ts). */
  readonly VITE_API_BASE_URL?: string;
  /**
   * The single canonical public origin (apex or www, no trailing slash) used to
   * build absolute canonicals, OG URLs, and `hreflang` in `<SeoHead>`
   * (see src/components/seo/config.ts). Defaults to the steering placeholder
   * when unset.
   */
  readonly VITE_PUBLIC_SITE_URL?: string;
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
