/**
 * Core Web Vitals field reporting (task 11.3; seo §9 "Core Web Vitals",
 * seo §12 "Measurement"; ui-ux §12; R9.4).
 *
 * Wires the `web-vitals` library so the **field** (real-user) values for the
 * three Core Web Vitals — LCP, INP, CLS — are collected from real visits and
 * beaconed to an analytics endpoint. Lab Lighthouse (see `lighthouserc.json`)
 * gates LCP and CLS at build time, but **INP is a field-only metric** that no
 * lab tool can measure; this module is how the INP < 200ms budget (and the
 * 75th-percentile field LCP/CLS) is actually observed against the seo §9
 * targets (LCP < 2.5s · INP < 200ms · CLS < 0.1).
 *
 * ## Consent-awareness (seo §12)
 *
 * Web-vitals reporting is **non-essential** analytics, so it is gated behind
 * explicit consent: nothing is collected or sent unless the user has granted
 * analytics consent (stored under {@link CONSENT_STORAGE_KEY}). The default is
 * **deny** — no consent value, an unreadable store (private mode), or any value
 * other than `"granted"` means we never register the observers, so a visitor
 * who has not opted in is never measured.
 *
 * ## No PII (seo §12)
 *
 * The beacon payload carries **only** the metric (name, value, rating, id,
 * delta, navigation type) plus a **sanitized** route template — never the live
 * URL. {@link sanitizePath} collapses dynamic segments (the QR `:payload`,
 * which can encode a phone number; salon ids; profile slugs) to their route
 * template and drops the query string and hash, so phone numbers, OTPs, and
 * other identifiers can never leak into an analytics event. No cookies, user
 * ids, or free-form data are attached.
 */

import type { Metric } from 'web-vitals';

/** localStorage key holding the analytics-consent decision (seo §12). */
export const CONSENT_STORAGE_KEY = 'analytics-consent';

/** The only consent value that enables reporting; anything else = deny. */
export const CONSENT_GRANTED = 'granted';

/** Endpoint the (PII-free) web-vitals beacon is sent to. */
export const WEB_VITALS_ENDPOINT = '/api/rum/web-vitals';

/**
 * The PII-free, low-cardinality shape sent per metric. Deliberately excludes
 * the raw URL, query string, hash, and any user/session identifier.
 */
export interface WebVitalsReport {
  /** Metric name, e.g. `"LCP"`, `"INP"`, `"CLS"`. */
  name: string;
  /** The metric value (ms for LCP/INP, unitless for CLS). */
  value: number;
  /** `web-vitals` rating bucket: `"good" | "needs-improvement" | "poor"`. */
  rating: string;
  /** Change since the metric was last reported. */
  delta: number;
  /** Per-page-load unique id `web-vitals` assigns to the metric instance. */
  id: string;
  /** Navigation type (`"navigate" | "reload" | "back-forward" | …`). */
  navigationType: string;
  /** Sanitized route **template** (no dynamic ids, query, or hash). */
  path: string;
}

/** Minimal `Storage`-like surface so the consent check is unit-testable. */
export interface ConsentStore {
  getItem(key: string): string | null;
}

/**
 * Returns whether analytics consent has been explicitly granted. Default-deny:
 * a missing value, a non-`"granted"` value, an absent store, or a throwing
 * store (Safari private mode) all yield `false`, so reporting never runs
 * without opt-in (seo §12).
 */
export function hasAnalyticsConsent(store?: ConsentStore | null): boolean {
  let resolved: ConsentStore | null | undefined = store;
  if (resolved === undefined) {
    resolved = typeof window !== 'undefined' ? (window.localStorage ?? null) : null;
  }
  if (!resolved) return false;
  try {
    return resolved.getItem(CONSENT_STORAGE_KEY) === CONSENT_GRANTED;
  } catch {
    return false;
  }
}

/**
 * Collapses a live pathname to a low-cardinality, PII-free route **template**:
 * the query string and hash are dropped, and the dynamic segments of the known
 * app routes (QR payload, salon id, profile/discovery slug) are replaced with
 * their parameter name. This keeps a QR payload that encodes a phone number —
 * or any salon/slug identifier — out of analytics, and keeps the metric
 * dimension countable. Unknown paths are returned with only their query/hash
 * stripped and a normalized leading slash.
 */
export function sanitizePath(rawPath: string | null | undefined): string {
  if (!rawPath) return '/';
  // Drop query string and hash fragment.
  let path = String(rawPath).split('?')[0].split('#')[0];
  if (path === '') return '/';
  if (!path.startsWith('/')) path = `/${path}`;
  // Collapse trailing slash (except the root).
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);

  // Map the dynamic app/public routes to their templates. Order matters:
  // the more specific funnel step (`/book/confirm`) is matched before `/book`.
  const rules: Array<[RegExp, string]> = [
    [/^\/qr\/.+$/, '/qr/:payload'],
    [/^\/salon\/[^/]+\/book\/confirm$/, '/salon/:salonId/book/confirm'],
    [/^\/salon\/[^/]+\/book$/, '/salon/:salonId/book'],
    [/^\/s\/[^/]+$/, '/s/:slug'],
    [/^\/city\/[^/]+$/, '/city/:city'],
    [/^\/services\/[^/]+$/, '/services/:type'],
  ];
  for (const [re, template] of rules) {
    if (re.test(path)) return template;
  }
  return path;
}

/** Builds the PII-free report payload from a `web-vitals` metric + a pathname. */
export function buildReport(metric: Metric, rawPath?: string | null): WebVitalsReport {
  const path =
    rawPath !== undefined
      ? sanitizePath(rawPath)
      : sanitizePath(typeof window !== 'undefined' ? window.location.pathname : '/');
  return {
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    delta: metric.delta,
    id: metric.id,
    navigationType: metric.navigationType,
    path,
  };
}

/** Optional injection seam for tests; defaults to the live browser endpoint. */
export interface SendOptions {
  endpoint?: string;
  /** Override for `navigator` (testing). */
  navigatorRef?: Pick<Navigator, 'sendBeacon'> | null;
  /** Override for `fetch` (testing / fallback). */
  fetchRef?: typeof fetch | null;
}

/**
 * Sends one report as a fire-and-forget beacon. Prefers `navigator.sendBeacon`
 * (survives page unload — exactly when CLS/LCP/INP finalize), falling back to
 * `fetch` with `keepalive`. Returns whether a send was dispatched. Never
 * throws: a reporting failure must never affect the page.
 */
export function sendReport(report: WebVitalsReport, opts: SendOptions = {}): boolean {
  const endpoint = opts.endpoint ?? WEB_VITALS_ENDPOINT;
  const body = JSON.stringify(report);

  const nav =
    'navigatorRef' in opts
      ? opts.navigatorRef
      : typeof navigator !== 'undefined'
        ? navigator
        : null;
  try {
    if (nav && typeof nav.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      return nav.sendBeacon(endpoint, blob);
    }
  } catch {
    // Fall through to fetch.
  }

  const doFetch = 'fetchRef' in opts ? opts.fetchRef : typeof fetch !== 'undefined' ? fetch : null;
  if (doFetch) {
    try {
      void doFetch(endpoint, {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
      }).catch(() => {
        /* best-effort: ignore network errors */
      });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/** Options for {@link reportWebVitals}, all optional (defaults = live browser). */
export interface ReportWebVitalsOptions extends SendOptions {
  /** Consent store override (testing); defaults to `window.localStorage`. */
  consentStore?: ConsentStore | null;
  /** Sink override (testing); defaults to {@link sendReport}. */
  onReport?: (report: WebVitalsReport) => void;
}

/**
 * Registers the LCP/INP/CLS field observers **iff** analytics consent is
 * granted, beaconing each finalized metric as a PII-free report. Safe to call
 * once at startup; a no-op (returns `false`) without consent or outside a
 * browser. Dynamically imports `web-vitals` so the library never weighs on the
 * initial bundle of a visitor who has not consented.
 */
export function reportWebVitals(opts: ReportWebVitalsOptions = {}): boolean {
  if (typeof window === 'undefined') return false;
  if (!hasAnalyticsConsent(opts.consentStore)) return false;

  const sink = opts.onReport ?? ((report: WebVitalsReport) => sendReport(report, opts));

  const handle = (metric: Metric): void => {
    sink(buildReport(metric));
  };

  void import('web-vitals')
    .then(({ onLCP, onINP, onCLS }) => {
      onLCP(handle);
      onINP(handle);
      onCLS(handle);
    })
    .catch(() => {
      /* best-effort: never break startup if the chunk fails to load */
    });

  return true;
}
