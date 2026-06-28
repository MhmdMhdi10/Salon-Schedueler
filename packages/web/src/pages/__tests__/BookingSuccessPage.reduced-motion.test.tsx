import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import '../../i18n';
import { BookingSuccessPage } from '../BookingSuccessPage';

/**
 * R6.3 — reduced-motion behaviour of the booking-success moment (the one screen
 * that uses the emphasized easing). Under `prefers-reduced-motion: reduce` the
 * signature `success-pop` (a `transform: scale` + `opacity` keyframe) must be
 * dropped while the content — the confirmation heading, the labelled status
 * icon, and the next-action CTA — stays fully present and operable; the
 * animation never gates completion of the action (ui-ux §9).
 *
 * The transform animation is gated behind Tailwind's `motion-safe:` variant
 * (`@media (prefers-reduced-motion: no-preference)`), and the authoritative
 * reduced-motion block in `tokens.css` neutralizes animation duration. We assert
 * the gate is authored on the animated element (so the transform cannot run
 * under reduce) and that the opacity/visible content is never hidden.
 */

const SUMMARY = {
  serviceName: 'کوتاهی مو',
  startAt: '2999-03-15T09:30:00.000Z',
  salonName: 'سالن رز',
};

function HomeProbe() {
  return <div>home-page</div>;
}

function renderPage(state: unknown = undefined) {
  const entry =
    state === undefined
      ? '/booking/success'
      : { pathname: '/booking/success', state };
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/booking/success" element={<BookingSuccessPage />} />
          <Route path="/" element={<HomeProbe />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

/** Simulate a user who prefers reduced motion via the matchMedia preference. */
function stubReducedMotion(prefersReduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion: reduce')
        ? prefersReduce
        : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

beforeEach(() => {
  stubReducedMotion(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('BookingSuccessPage — reduced motion (R6.3)', () => {
  it('gates the transform animation behind motion-safe (dropped under reduce)', () => {
    renderPage(SUMMARY);
    const icon = screen.getByRole('img', { name: 'در انتظار تایید سالن' });
    // The signature success-pop (transform + opacity) is applied ONLY via the
    // `motion-safe:` variant, so under reduced motion the transform never runs.
    expect(icon.className).toContain('motion-safe:animate-success-pop');
    // It is never authored unconditionally (which would animate under reduce).
    expect(icon.className).not.toMatch(/(^|\s)animate-success-pop(\s|$)/);
  });

  it('keeps the success content present and visible under reduced motion', () => {
    renderPage(SUMMARY);
    // Content (opacity/visibility) is never hidden by the dropped transform.
    expect(
      screen.getByRole('heading', { name: 'درخواست رزرو شما ثبت شد' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'در انتظار تایید سالن' }),
    ).toBeInTheDocument();
    // The summary still renders.
    expect(screen.getByText('کوتاهی مو')).toBeInTheDocument();
  });

  it('never gates the next action on the animation', async () => {
    renderPage(SUMMARY);
    // The CTA is immediately operable; completion does not wait on any animation.
    screen.getByRole('button', { name: 'بازگشت به خانه' }).click();
    expect(await screen.findByText('home-page')).toBeInTheDocument();
  });

  it('uses the same gated class when motion is allowed (no unconditional run)', () => {
    stubReducedMotion(false);
    renderPage(SUMMARY);
    const icon = screen.getByRole('img', { name: 'در انتظار تایید سالن' });
    // The gate is authored identically; the media query (not JS) decides play.
    expect(icon.className).toContain('motion-safe:animate-success-pop');
  });
});
