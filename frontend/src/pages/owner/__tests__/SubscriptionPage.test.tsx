import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { ThemeProvider } from '../../../components/theme';
import '../../../i18n';

/**
 * Component tests for the owner-panel «اشتراک من» page (task 5.3; R3.8, R3.9,
 * R2.1). They cover the four behaviours the task calls out:
 *
 *  1. **Status rendering** — the effective status shows as an icon+text badge
 *     (not color-only) with the expiry as a Jalali/Persian-digit date.
 *  2. **Plan selection** — the configurable paid plans render with Rial prices
 *     and can be selected; the purchase CTA is gated until a plan is chosen.
 *  3. **Purchase redirect** — confirming hands off to the gateway URL returned
 *     by `initiatePurchase` (money confirmed server-side, never faked).
 *  4. **Expired → renewal** — an `expired` owner is surfaced the renewal flow
 *     (the renewal callout + a "renew" CTA), reflecting the 402
 *     `SUBSCRIPTION_REQUIRED` gating contract.
 *
 * Data states (skeleton/error+retry) are exercised too. The axe pass is task
 * 5.5.
 */

const getStatus = vi.fn();
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
    subscriptionApi: {
      getStatus: (...args: unknown[]) => getStatus(...args),
      getPlans: (...args: unknown[]) => getPlans(...args),
      initiatePurchase: (...args: unknown[]) => initiatePurchase(...args),
    },
  };
});

import { OwnerSubscriptionPage } from '../SubscriptionPage';

const PLANS = [
  { kind: 'annual', durationDays: 365, priceRial: 60000000 },
  { kind: 'monthly', durationDays: 30, priceRial: 6000000 },
  { kind: 'quarterly', durationDays: 90, priceRial: 16000000 },
];

function renderPage(path = '/owner/subscription') {
  return render(
    <HelmetProvider>
      <ThemeProvider defaultTheme="light">
        <div dir="rtl" lang="fa" className="app-root">
          <MemoryRouter initialEntries={[path]}>
            <OwnerSubscriptionPage />
          </MemoryRouter>
        </div>
      </ThemeProvider>
    </HelmetProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getPlans.mockResolvedValue({ plans: PLANS });
});

afterEach(() => {
  cleanup();
});

describe('OwnerSubscriptionPage — load + status (R3.4, R3.5)', () => {
  it('preserves the owner-subscription-page testID', async () => {
    getStatus.mockResolvedValue({
      status: 'active',
      planKind: 'monthly',
      expiresAt: '2025-05-07T00:00:00.000Z',
    });
    renderPage();
    expect(await screen.findByTestId('owner-subscription-page')).toBeInTheDocument();
  });

  it('shows a skeleton while loading', () => {
    getStatus.mockReturnValue(new Promise(() => {})); // never resolves
    renderPage();
    expect(screen.getByTestId('subscription-loading')).toBeInTheDocument();
  });

  it('renders the status with text (not color-only) and a Jalali expiry', async () => {
    getStatus.mockResolvedValue({
      status: 'active',
      planKind: 'monthly',
      expiresAt: '2025-05-07T00:00:00.000Z',
    });
    renderPage();

    const statusCard = await screen.findByTestId('subscription-status');
    // Status conveyed with text, not color alone.
    expect(statusCard).toHaveTextContent('فعال');
    // Expiry shown as a Jalali date in Persian digits (۱۴۰۴ for 2025).
    const expiry = screen.getByTestId('subscription-expiry');
    expect(expiry).toHaveTextContent('۱۴۰۴');
  });

  it('shows an error + retry when loading fails, then recovers', async () => {
    getStatus.mockRejectedValueOnce(new Error('network'));
    renderPage();

    const errorState = await screen.findByTestId('subscription-error');
    expect(errorState).toBeInTheDocument();

    // Retry: status now succeeds.
    getStatus.mockResolvedValue({
      status: 'active',
      planKind: 'monthly',
      expiresAt: '2025-05-07T00:00:00.000Z',
    });
    fireEvent.click(screen.getByRole('button', { name: 'تلاش مجدد' }));
    expect(await screen.findByTestId('subscription-status')).toBeInTheDocument();
  });

  it('shows a success notice after returning from subscription payment', async () => {
    getStatus.mockResolvedValue({
      status: 'active',
      planKind: 'monthly',
      expiresAt: '2025-05-07T00:00:00.000Z',
    });
    renderPage('/owner/subscription?payment=success');

    expect(await screen.findByTestId('subscription-payment-success')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'پرداخت اشتراک با موفقیت انجام شد' }),
    ).toBeInTheDocument();
  });

  it('shows an error notice after a failed subscription payment', async () => {
    getStatus.mockResolvedValue({
      status: 'expired',
      planKind: 'monthly',
      expiresAt: '2024-05-07T00:00:00.000Z',
    });
    renderPage('/owner/subscription?payment=error');

    expect(await screen.findByTestId('subscription-payment-error')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'پرداخت اشتراک ناموفق بود' })).toBeInTheDocument();
  });
});

describe('OwnerSubscriptionPage — plan selection (R3.1, R3.2)', () => {
  beforeEach(() => {
    getStatus.mockResolvedValue({
      status: 'active',
      planKind: 'monthly',
      expiresAt: '2025-05-07T00:00:00.000Z',
    });
  });

  it('renders the paid plans with Rial/Persian-digit prices', async () => {
    renderPage();
    const plans = await screen.findByTestId('subscription-plans');
    // Monthly price 6,000,000 → grouped Persian digits.
    expect(plans).toHaveTextContent('۶٬۰۰۰٬۰۰۰');
    expect(plans).toHaveTextContent('ریال');
    // All three paid plans are present (trial is excluded).
    expect(plans).toHaveTextContent('ماهانه');
    expect(plans).toHaveTextContent('سه‌ماهه');
    expect(plans).toHaveTextContent('سالانه');
  });

  it('gates the purchase CTA until a plan is selected', async () => {
    renderPage();
    await screen.findByTestId('subscription-plans');

    const cta = screen.getByTestId('subscription-purchase');
    expect(cta).toBeDisabled();

    fireEvent.click(screen.getByRole('radio', { name: /ماهانه/ }));
    await waitFor(() => expect(cta).toBeEnabled());
  });
});

describe('OwnerSubscriptionPage — purchase redirect (R3.6)', () => {
  beforeEach(() => {
    getStatus.mockResolvedValue({
      status: 'active',
      planKind: 'monthly',
      expiresAt: '2025-05-07T00:00:00.000Z',
    });
  });

  it('initiates purchase and hands off to the gateway URL on confirm', async () => {
    // Replace location.href with a writable stub so the redirect is observable.
    const original = window.location;
    const assigned: string[] = [];
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...original,
        set href(url: string) {
          assigned.push(url);
        },
      },
    });

    initiatePurchase.mockResolvedValue({
      redirectUrl: 'https://zarinpal.example/pay/sub-123',
    });

    renderPage();
    await screen.findByTestId('subscription-plans');

    fireEvent.click(screen.getByRole('radio', { name: /سالانه/ }));
    fireEvent.click(screen.getByTestId('subscription-purchase'));

    await waitFor(() =>
      expect(initiatePurchase).toHaveBeenCalledWith(
        '11111111-1111-1111-1111-111111111111',
        'annual',
      ),
    );
    await waitFor(() => expect(assigned).toContain('https://zarinpal.example/pay/sub-123'));
    // The explicit redirect surface is shown during hand-off.
    expect(screen.getByTestId('subscription-redirecting')).toBeInTheDocument();

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: original,
    });
  });

  it('surfaces a purchase error without faking success', async () => {
    initiatePurchase.mockRejectedValue(new Error('gateway down'));

    renderPage();
    await screen.findByTestId('subscription-plans');

    fireEvent.click(screen.getByRole('radio', { name: /ماهانه/ }));
    fireEvent.click(screen.getByTestId('subscription-purchase'));

    expect(await screen.findByTestId('subscription-purchase-error')).toBeInTheDocument();
    expect(screen.queryByTestId('subscription-redirecting')).not.toBeInTheDocument();
  });
});

describe('OwnerSubscriptionPage — expired → renewal (R3.5, 402 contract)', () => {
  it('surfaces the renewal flow with a renew CTA when expired', async () => {
    getStatus.mockResolvedValue({
      status: 'expired',
      planKind: 'monthly',
      expiresAt: '2024-05-07T00:00:00.000Z',
    });
    renderPage();

    // Renewal callout is present and announced.
    const renewal = await screen.findByTestId('subscription-renewal');
    expect(renewal).toBeInTheDocument();
    // Status reads "expired".
    expect(screen.getByTestId('subscription-status')).toHaveTextContent('منقضی‌شده');
    // The CTA is framed as "renew" rather than a plain purchase.
    fireEvent.click(screen.getByRole('radio', { name: /ماهانه/ }));
    expect(screen.getByTestId('subscription-purchase')).toHaveTextContent('تمدید اشتراک');
  });

  it('does not show the renewal callout for an active subscription', async () => {
    getStatus.mockResolvedValue({
      status: 'active',
      planKind: 'monthly',
      expiresAt: '2025-05-07T00:00:00.000Z',
    });
    renderPage();

    await screen.findByTestId('subscription-status');
    expect(screen.queryByTestId('subscription-renewal')).not.toBeInTheDocument();
  });
});
