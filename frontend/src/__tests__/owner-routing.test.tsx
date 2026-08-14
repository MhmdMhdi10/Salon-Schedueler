import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '../i18n';
import { ROUTE_LOADER_TESTID } from '../components/layout';

/**
 * App-level routing tests for the owner panel (task 5.1; R2.1, R2.2, R6.4).
 *
 * These verify the two structural guarantees the task calls out:
 *  - the `/owner/*` routes are **code-split**: visiting `/owner` first paints
 *    the `<Suspense>` route loader while the owner chunk is fetched (the owner
 *    pages are loaded with `React.lazy`, off the public/customer bundle), then
 *    swaps in the resolved page; and
 *  - once the lazy chunk resolves, the **auth bootstrap** restores the session
 *    and the panel (not the login surface) renders.
 */

const bootstrapAuth = vi.fn();
const getAccessToken = vi.fn();
const getMe = vi.fn();
const signOut = vi.fn();

vi.mock('../api/client', () => ({
  // Auth bootstrap surface used by OwnerLayout.
  bootstrapAuth: () => bootstrapAuth(),
  getAccessToken: () => getAccessToken(),
  signOut: () => signOut(),
  meApi: { getMe: () => getMe() },
  // Stubs so any other lazily-loaded page that imports the client still mounts.
  setAccessToken: vi.fn(),
  setRefreshToken: vi.fn(),
  authApi: {
    requestOtp: vi.fn().mockResolvedValue(undefined),
    verifyOtp: vi.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }),
    refresh: vi.fn(),
  },
  salonApi: {
    resolveQr: vi.fn().mockResolvedValue({ salon: { id: 's1', name: 'سالن' } }),
    getServices: vi.fn().mockResolvedValue({ services: [] }),
    getAvailability: vi.fn().mockResolvedValue({ slots: [] }),
  },
  adminApi: {
    getStaff: vi.fn().mockResolvedValue({ staff: [] }),
    getChairs: vi.fn().mockResolvedValue({ chairs: [] }),
    getCalendar: vi.fn().mockResolvedValue({ appointments: [] }),
    getAnalytics: vi.fn().mockResolvedValue({ utilization: {}, revenue: 0, busiestWindows: [] }),
  },
  approvalPolicyApi: {
    get: vi.fn().mockResolvedValue({ autoApprove: false, staff: [] }),
    setSalon: vi.fn().mockResolvedValue({ ok: true, autoApprove: false }),
    setStaff: vi.fn().mockResolvedValue({ ok: true, autoApprove: null }),
  },
  staffAvailabilityApi: {
    list: vi.fn().mockResolvedValue({ blocks: [] }),
    add: vi.fn().mockResolvedValue({ block: {} }),
    remove: vi.fn().mockResolvedValue({ ok: true }),
  },
  holidaysApi: {
    list: vi.fn().mockResolvedValue({ holidays: [] }),
    add: vi.fn().mockResolvedValue({ holiday: {} }),
    remove: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

import { App } from '../App';

beforeEach(() => {
  vi.clearAllMocks();
  getAccessToken.mockReturnValue('access-token');
  getMe.mockResolvedValue({ principal: { id: 'u1', role: 'Owner' } });
  window.history.pushState({}, '', '/owner/calendar');
});

afterEach(() => {
  cleanup();
  window.history.pushState({}, '', '/');
});

describe('owner routes are code-split off the main bundle', () => {
  it('shows the Suspense route loader before the lazy owner chunk resolves', () => {
    render(<App />);
    // The owner pages are behind React.lazy, so the very first paint is the
    // route loader fallback — proof the chunk is fetched on demand.
    expect(screen.getByTestId(ROUTE_LOADER_TESTID)).toBeInTheDocument();
  });

  it('resolves the owner chunk and renders the panel after bootstrap', async () => {
    render(<App />);
    // Once the lazy chunk loads and the bootstrap restores the session, the
    // owner calendar placeholder renders inside the owner shell.
    expect(await screen.findByTestId('owner-calendar-page')).toBeInTheDocument();
    expect(bootstrapAuth).not.toHaveBeenCalled(); // in-memory token reused
    // `/me` is fetched to derive the principal: once by the app-wide
    // AuthProvider (drives the header) and once by the OwnerLayout guard.
    expect(getMe).toHaveBeenCalled();
  });
});
