import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, within, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { ThemeProvider } from '../../../components/theme';
import '../../../i18n';
import {
  renderRtl,
  expectNoSeriousA11yViolations,
  expectSingleH1AndOrderedHeadings,
} from '../../../test/a11y';
import type { OwnerRole } from '../../../api/client';

/**
 * Accessibility pass for the owner panel surfaces (task 5.5; R7.1; ui-ux §10
 * accessibility + §14 per-screen QA).
 *
 * The other owner suites (`OwnerShell`, `OwnerLayout`, `OwnerSections`,
 * `SubscriptionPage`, `QrPage`) cover the *behaviour* + the preserved testIDs;
 * the `OwnerShell` shell already has its own axe pass. This file closes the
 * remaining a11y gap the task calls out — an explicit axe audit + heading/
 * landmark outline for the owner panel surfaces that didn't have one:
 *
 *  1. **OwnerLayout / OwnerShell** rendered with a reused admin page inside it,
 *     so the audit sees the panel chrome (header/nav/main landmarks, the
 *     icon-only theme toggle, role-filtered nav) around real content.
 *  2. **The reused admin pages** (calendar/analytics/configuration) inside the
 *     owner shell — a focused axe assertion that they pass *in the owner
 *     context*, not only standalone.
 *  3. **SubscriptionPage** — populated status + plan picker.
 *  4. **QrPage** — populated QR preview + campaign URL + standee.
 *
 * Every audit asserts: no serious/critical axe violations, exactly one `<h1>`
 * with ordered headings, RTL rendering (`renderRtl`), the panel landmarks, and
 * that icon-only controls carry an accessible label.
 *
 * Honesty caveat (ui-ux §10): automated axe is a floor, not full WCAG 2.2 AA
 * conformance — manual AT/keyboard review in Farsi/RTL is still required.
 *
 * The api/client is mocked (mirroring the existing owner suites) so every
 * surface mounts to a populated state for the audit.
 */

// ---- API client mock (covers every endpoint the owner surfaces call) -------

const bootstrapAuth = vi.fn();
const getAccessToken = vi.fn();
const getMe = vi.fn();
const signOut = vi.fn();
const getSalonQr = vi.fn();
const getSubStatus = vi.fn();
const getPlans = vi.fn();
const initiatePurchase = vi.fn();

vi.mock('../../../api/client', () => {
  class ApiError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message);
      this.name = 'ApiError';
    }
  }
  return {
    ApiError,
    bootstrapAuth: () => bootstrapAuth(),
    getAccessToken: () => getAccessToken(),
    signOut: () => signOut(),
    meApi: {
      getMe: () => getMe(),
    },
    // The owner sections reuse the admin pages, which read the
    // calendar/analytics/config endpoints — stub them so the panel mounts to a
    // populated/empty state for the audit.
    adminApi: {
      getCalendar: vi.fn().mockResolvedValue({ appointments: [] }),
      getAnalytics: vi
        .fn()
        .mockResolvedValue({ utilization: {}, revenue: 0, busiestWindows: [] }),
      getStaff: vi.fn().mockResolvedValue({ staff: [] }),
      getChairs: vi.fn().mockResolvedValue({ chairs: [] }),
    },
    salonApi: {
      getServices: vi.fn().mockResolvedValue({ services: [] }),
      getStylists: vi.fn().mockResolvedValue({ stylists: [] }),
    },
    approvalPolicyApi: {
      get: vi.fn().mockResolvedValue({ autoApprove: false, staff: [] }),
      setSalon: vi.fn().mockResolvedValue({ ok: true, autoApprove: false }),
      setStaff: vi.fn().mockResolvedValue({ ok: true, autoApprove: null }),
    },
    brandAccentApi: {
      get: vi.fn().mockResolvedValue({ brandAccent: null }),
      set: vi.fn().mockResolvedValue({ ok: true, brandAccent: null }),
    },
    subscriptionApi: {
      getStatus: (...args: unknown[]) => getSubStatus(...args),
      getPlans: (...args: unknown[]) => getPlans(...args),
      initiatePurchase: (...args: unknown[]) => initiatePurchase(...args),
    },
    qrApi: {
      getSalonQr: (...args: unknown[]) => getSalonQr(...args),
      getStaffQr: vi.fn().mockResolvedValue({
        payload: 'https://book.salon.app/s/v1s.staff-1.salon-token-42.cafebabe',
        staffName: 'زهرا',
        salonName: 'سالن رز',
      }),
    },
  };
});

import { OwnerLayout } from '../OwnerLayout';
import {
  OwnerCalendarPage,
  OwnerAnalyticsPage,
  OwnerConfigurationPage,
  OwnerSubscriptionPage,
  OwnerQrPage,
} from '..';

const SUBSCRIPTION_STATUS = {
  status: 'active' as const,
  planKind: 'monthly' as const,
  expiresAt: '2025-05-07T00:00:00.000Z',
};

const PLANS = [
  { kind: 'monthly', durationDays: 30, priceRial: 6000000 },
  { kind: 'quarterly', durationDays: 90, priceRial: 16000000 },
  { kind: 'annual', durationDays: 365, priceRial: 60000000 },
];

const QR_RESPONSE = {
  payload: 'https://book.salon.app/s/v1.salon-token-42.deadbeef',
  url: 'https://book.salon.app/s/salon-rose?utm_source=qr',
  salonName: 'سالن رز',
};

/**
 * Mounts the whole owner panel (auth guard + shell + nested section) inside a
 * `dir="rtl"` wrapper for the given `role`, returning the RTL container axe
 * audits run against.
 */
function renderOwnerPanel(role: OwnerRole, initialPath: string) {
  getAccessToken.mockReturnValue('access-token');
  getMe.mockResolvedValue({ principal: { id: 'u1', role } });

  return renderRtl(
    <HelmetProvider>
      <ThemeProvider defaultTheme="light">
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/owner" element={<OwnerLayout />}>
              <Route path="calendar" element={<OwnerCalendarPage />} />
              <Route path="analytics" element={<OwnerAnalyticsPage />} />
              <Route path="config" element={<OwnerConfigurationPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ThemeProvider>
    </HelmetProvider>,
  );
}

/** Mounts a standalone owner section page inside a `dir="rtl"`/`lang="fa"` root. */
function renderSection(ui: React.ReactElement, initialPath: string) {
  return renderRtl(
    <HelmetProvider>
      <ThemeProvider defaultTheme="light">
        <div lang="fa" className="app-root">
          <MemoryRouter initialEntries={[initialPath]}>{ui}</MemoryRouter>
        </div>
      </ThemeProvider>
    </HelmetProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getSubStatus.mockResolvedValue(SUBSCRIPTION_STATUS);
  getPlans.mockResolvedValue({ plans: PLANS });
  getSalonQr.mockResolvedValue(QR_RESPONSE);
});

afterEach(() => {
  cleanup();
});

describe('Owner panel a11y — OwnerLayout / OwnerShell chrome (R7.1)', () => {
  it('exposes the panel landmarks (header/nav/main) around the content', async () => {
    const { rtlContainer } = renderOwnerPanel('Owner', '/owner/calendar');
    await screen.findByTestId('admin-calendar');

    // The owner shell contributes its own header + side/tab-bar navs, and the
    // panel exposes a single <main> landmark for the routed content.
    const shell = rtlContainer.querySelector('[data-shell="owner"]');
    expect(shell?.querySelector('header')).toBeTruthy();
    expect(screen.getAllByRole('navigation').length).toBeGreaterThanOrEqual(1);
    const mains = screen.getAllByRole('main');
    expect(mains).toHaveLength(1);
  });

  it('labels the icon-only theme toggle in the header', async () => {
    const { rtlContainer } = renderOwnerPanel('Owner', '/owner/calendar');
    await screen.findByTestId('admin-calendar');

    // The owner shell header carries the icon-only theme toggle, identified by
    // its toggle (aria-pressed) semantics; an icon-only control must be named.
    const header = rtlContainer.querySelector('[data-shell="owner"] > header');
    expect(header).toBeTruthy();
    const toggle = within(header as HTMLElement).getByRole('button', {
      pressed: false,
    });
    expect(toggle).toHaveAccessibleName();
  });

  it('opens the outline at a single <h1> with ordered headings', async () => {
    const { rtlContainer } = renderOwnerPanel('Owner', '/owner/calendar');
    await screen.findByTestId('admin-calendar');
    expectSingleH1AndOrderedHeadings(rtlContainer);
  });

  it('has no serious/critical violations in RTL', async () => {
    const { rtlContainer } = renderOwnerPanel('Owner', '/owner/calendar');
    await screen.findByTestId('admin-calendar');
    await expectNoSeriousA11yViolations(rtlContainer);
  });
});

describe('Owner panel a11y — reused admin pages in the owner context (R7.1)', () => {
  it('analytics passes axe + heading outline inside the owner shell', async () => {
    const { rtlContainer } = renderOwnerPanel('Owner', '/owner/analytics');
    await screen.findByTestId('admin-analytics');
    expectSingleH1AndOrderedHeadings(rtlContainer);
    await expectNoSeriousA11yViolations(rtlContainer);
  });

  it('configuration passes axe + heading outline inside the owner shell', async () => {
    const { rtlContainer } = renderOwnerPanel('Owner', '/owner/config');
    await screen.findByTestId('admin-configuration');
    expectSingleH1AndOrderedHeadings(rtlContainer);
    await expectNoSeriousA11yViolations(rtlContainer);
  });
});

describe('Owner panel a11y — SubscriptionPage (R7.1)', () => {
  it('opens the outline at a single <h1> with ordered headings', async () => {
    const { rtlContainer } = renderSection(
      <OwnerSubscriptionPage />,
      '/owner/subscription',
    );
    await screen.findByTestId('subscription-status');
    expectSingleH1AndOrderedHeadings(rtlContainer);
  });

  it('has no serious/critical violations in RTL', async () => {
    const { rtlContainer } = renderSection(
      <OwnerSubscriptionPage />,
      '/owner/subscription',
    );
    await screen.findByTestId('subscription-status');
    await expectNoSeriousA11yViolations(rtlContainer);
  });
});

describe('Owner panel a11y — QrPage (R7.1)', () => {
  it('opens the outline at a single <h1> with ordered headings', async () => {
    const { rtlContainer } = renderSection(<OwnerQrPage />, '/owner/qr');
    await screen.findByTestId('qr-card');
    expectSingleH1AndOrderedHeadings(rtlContainer);
  });

  it('renders the QR images with a meaningful (non-empty) alt', async () => {
    renderSection(<OwnerQrPage />, '/owner/qr');
    await screen.findByTestId('qr-card');
    // Both the preview and the standee QR carry a meaningful Persian alt.
    expect(screen.getByTestId('qr-image')).toHaveAccessibleName(
      expect.stringContaining('سالن رز'),
    );
    expect(
      (screen.getByTestId('qr-standee-image') as HTMLImageElement).getAttribute(
        'alt',
      ),
    ).toBeTruthy();
  });

  it('has no serious/critical violations in RTL', async () => {
    const { rtlContainer } = renderSection(<OwnerQrPage />, '/owner/qr');
    await screen.findByTestId('qr-card');
    await expectNoSeriousA11yViolations(rtlContainer);
  });
});
