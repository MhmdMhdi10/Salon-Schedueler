import { describe, it, expect, vi } from 'vitest';
import type { Metric } from 'web-vitals';
import {
  CONSENT_STORAGE_KEY,
  CONSENT_GRANTED,
  WEB_VITALS_ENDPOINT,
  hasAnalyticsConsent,
  sanitizePath,
  buildReport,
  sendReport,
  reportWebVitals,
  type WebVitalsReport,
} from './webVitals';

/**
 * Tests for the Core Web Vitals field reporting (task 11.3; seo §9/§12; R9.4).
 *
 * These pin the two governing guarantees from seo §12: reporting is
 * **consent-aware** (default-deny, opt-in only) and **PII-free** (the live URL,
 * query, hash, and dynamic ids — including the QR payload that can encode a
 * phone number — never reach the beacon; only a route template does).
 */

function makeMetric(overrides: Partial<Metric> = {}): Metric {
  return {
    name: 'LCP',
    value: 1234,
    rating: 'good',
    delta: 1234,
    id: 'v4-1700000000000-1234567890123',
    navigationType: 'navigate',
    entries: [],
    ...overrides,
  } as Metric;
}

describe('hasAnalyticsConsent (default-deny opt-in, seo §12)', () => {
  it('is false when no consent value is stored', () => {
    expect(hasAnalyticsConsent({ getItem: () => null })).toBe(false);
  });

  it('is true only for the exact "granted" value', () => {
    expect(
      hasAnalyticsConsent({ getItem: () => CONSENT_GRANTED }),
    ).toBe(true);
  });

  it('is false for any other value (e.g. "denied", stale, typo)', () => {
    expect(hasAnalyticsConsent({ getItem: () => 'denied' })).toBe(false);
    expect(hasAnalyticsConsent({ getItem: () => 'true' })).toBe(false);
  });

  it('reads from the documented storage key', () => {
    const getItem = vi.fn().mockReturnValue(CONSENT_GRANTED);
    hasAnalyticsConsent({ getItem });
    expect(getItem).toHaveBeenCalledWith(CONSENT_STORAGE_KEY);
  });

  it('default-denies when the store throws (private mode)', () => {
    expect(
      hasAnalyticsConsent({
        getItem: () => {
          throw new Error('SecurityError');
        },
      }),
    ).toBe(false);
  });

  it('default-denies when the store is null', () => {
    expect(hasAnalyticsConsent(null)).toBe(false);
  });
});

describe('sanitizePath (PII-free, low-cardinality route templates, seo §12)', () => {
  it('collapses the QR payload (which can encode a phone number) to a template', () => {
    expect(sanitizePath('/qr/09123456789-some-encoded-payload')).toBe(
      '/qr/:payload',
    );
  });

  it('collapses salon id funnel routes to templates', () => {
    expect(sanitizePath('/salon/abc-123/book')).toBe('/salon/:salonId/book');
    expect(sanitizePath('/salon/abc-123/book/confirm')).toBe(
      '/salon/:salonId/book/confirm',
    );
  });

  it('collapses public profile/discovery slugs to templates', () => {
    expect(sanitizePath('/s/salon-rose')).toBe('/s/:slug');
    expect(sanitizePath('/city/tehran')).toBe('/city/:city');
    expect(sanitizePath('/services/haircut')).toBe('/services/:type');
  });

  it('strips the query string and hash fragment', () => {
    expect(sanitizePath('/about?utm_source=x&phone=09123456789#section')).toBe(
      '/about',
    );
  });

  it('normalizes empty/relative paths and trailing slashes', () => {
    expect(sanitizePath('')).toBe('/');
    expect(sanitizePath(null)).toBe('/');
    expect(sanitizePath(undefined)).toBe('/');
    expect(sanitizePath('about')).toBe('/about');
    expect(sanitizePath('/about/')).toBe('/about');
    expect(sanitizePath('/')).toBe('/');
  });

  it('passes through unknown static paths unchanged (minus query/hash)', () => {
    expect(sanitizePath('/booking/success?id=42')).toBe('/booking/success');
  });
});

describe('buildReport (PII-free payload, seo §12)', () => {
  it('carries only the metric fields plus a sanitized route template', () => {
    const report = buildReport(
      makeMetric({ name: 'INP', value: 180, rating: 'good' }),
      '/qr/09123456789-payload?ref=x',
    );
    expect(report).toEqual<WebVitalsReport>({
      name: 'INP',
      value: 180,
      rating: 'good',
      delta: 1234,
      id: 'v4-1700000000000-1234567890123',
      navigationType: 'navigate',
      path: '/qr/:payload',
    });
  });

  it('never includes the raw url, query, hash, or any phone-like value', () => {
    const report = buildReport(
      makeMetric(),
      '/salon/abc/book/confirm?phone=09123456789#pay',
    );
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain('09123456789');
    expect(serialized).not.toContain('phone');
    expect(serialized).not.toContain('?');
    expect(serialized).not.toContain('#');
    expect(report.path).toBe('/salon/:salonId/book/confirm');
  });
});

describe('sendReport (best-effort beacon)', () => {
  it('prefers navigator.sendBeacon and targets the endpoint', () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    const report = buildReport(makeMetric(), '/about');
    const ok = sendReport(report, { navigatorRef: { sendBeacon } });
    expect(ok).toBe(true);
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(sendBeacon.mock.calls[0][0]).toBe(WEB_VITALS_ENDPOINT);
  });

  it('falls back to keepalive fetch when sendBeacon is unavailable', () => {
    const fetchRef = vi.fn().mockResolvedValue(new Response(null));
    const report = buildReport(makeMetric(), '/about');
    const ok = sendReport(report, {
      navigatorRef: null,
      fetchRef: fetchRef as unknown as typeof fetch,
    });
    expect(ok).toBe(true);
    expect(fetchRef).toHaveBeenCalledWith(
      WEB_VITALS_ENDPOINT,
      expect.objectContaining({ method: 'POST', keepalive: true }),
    );
  });

  it('returns false when no transport exists, without throwing', () => {
    const report = buildReport(makeMetric(), '/about');
    expect(sendReport(report, { navigatorRef: null, fetchRef: null })).toBe(
      false,
    );
  });
});

describe('reportWebVitals (consent gate, seo §12)', () => {
  it('is a no-op and reports nothing without consent', () => {
    const onReport = vi.fn();
    const registered = reportWebVitals({
      consentStore: { getItem: () => null },
      onReport,
    });
    expect(registered).toBe(false);
    expect(onReport).not.toHaveBeenCalled();
  });

  it('registers the observers when consent is granted', () => {
    const onReport = vi.fn();
    const registered = reportWebVitals({
      consentStore: { getItem: () => CONSENT_GRANTED },
      onReport,
    });
    expect(registered).toBe(true);
  });
});
