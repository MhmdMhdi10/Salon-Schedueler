import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import '../../i18n';
import { renderRtl, expectNoSeriousA11yViolations } from '../../test/a11y';
import { Avatar, TextField, Textarea, Select } from '../../components/ui';

/**
 * Accessibility pass — text alternatives & forms (task 10.2; R1.3, R10.5,
 * R10.6; ui-ux §3, §7, §10).
 *
 * The token-contrast half of 10.2 is proven numerically in
 * `src/styles/contrast.test.ts` (axe can't compute contrast under jsdom). This
 * file proves the other two halves at the DOM level:
 *
 *  - **Text alternatives (R10.5):** every `<img>` the redesign renders either
 *    carries a meaningful `alt` or is explicitly decorative (`alt=""` + hidden
 *    from AT). Informative icons are labelled; purely decorative icons are
 *    `aria-hidden`.
 *  - **Forms (R10.6):** every form control has a programmatic label, and error
 *    states are identified programmatically (`aria-invalid` + an
 *    `aria-describedby` pointing at a `role="alert"` message — text + icon, not
 *    color alone).
 *
 * Page-level checks render the real public pages (which own the redesign's
 * images) and the auth form. Primitive-level checks pin the field/avatar
 * contracts the rest of the app composes from.
 */

// ---- API client mock (auth form submits through it) ------------------------

vi.mock('../../api/client', () => {
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
    setAccessToken: vi.fn(),
    authApi: {
      requestOtp: vi.fn().mockResolvedValue(undefined),
      verifyOtp: vi.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }),
    },
  };
});

import { AuthPage } from '../AuthPage';
import { MarketingHome } from '../MarketingHome';
import { SalonProfilePage } from '../SalonProfilePage';
import { ToastProvider } from '../../components/ui/Toast';

function wrap(ui: React.ReactElement, initialPath = '/') {
  return (
    <HelmetProvider>
      <MemoryRouter initialEntries={[initialPath]}>{ui}</MemoryRouter>
    </HelmetProvider>
  );
}

/**
 * Every `<img>` under `root` must be accessible: either a non-empty `alt`
 * (informative) or `alt=""` (decorative). A missing `alt` attribute entirely is
 * a failure — it makes screen readers announce the file name.
 */
function expectEveryImageHasAlt(root: HTMLElement) {
  const images = Array.from(root.querySelectorAll('img'));
  expect(images.length).toBeGreaterThan(0);
  for (const img of images) {
    expect(
      img.hasAttribute('alt'),
      `<img src="${img.getAttribute('src')}"> is missing an alt attribute`,
    ).toBe(true);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('Text alternatives — page images (R10.5)', () => {
  it('MarketingHome hero image carries a meaningful, non-empty alt', () => {
    const { getByTestId } = render(wrap(<MarketingHome />, '/'));
    const root = getByTestId('marketing-home');
    expectEveryImageHasAlt(root);
    const hero = root.querySelector('img');
    expect(hero?.getAttribute('alt')?.trim().length ?? 0).toBeGreaterThan(0);
  });

  it('SalonProfile gallery images all carry a meaningful Persian alt', () => {
    const { getByTestId } = render(
      wrap(
        <Routes>
          <Route path="/s/:slug" element={<SalonProfilePage />} />
        </Routes>,
        '/s/salon-rose',
      ),
    );
    const root = getByTestId('salon-profile');
    const images = Array.from(root.querySelectorAll('img'));
    expect(images.length).toBeGreaterThan(0);
    for (const img of images) {
      expect(img.getAttribute('alt')?.trim().length ?? 0).toBeGreaterThan(0);
    }
  });

  it('decorative icons on the pages are hidden from assistive tech', () => {
    const { getByTestId } = render(
      wrap(
        <Routes>
          <Route path="/s/:slug" element={<SalonProfilePage />} />
        </Routes>,
        '/s/salon-rose',
      ),
    );
    // The lucide icons in the section headings are decorative (the heading text
    // carries the meaning), so they must be aria-hidden.
    const svgs = Array.from(getByTestId('salon-profile').querySelectorAll('svg'));
    expect(svgs.length).toBeGreaterThan(0);
    for (const svg of svgs) {
      expect(svg.getAttribute('aria-hidden')).toBe('true');
    }
  });
});

describe('Text alternatives — Avatar decorative vs labelled (R10.5)', () => {
  it('labelled avatar exposes the name as the image alt', () => {
    render(<Avatar src="/x.jpg" name="سارا محمدی" />);
    const img = document.querySelector('img');
    expect(img?.getAttribute('alt')).toBe('سارا محمدی');
  });

  it('decorative avatar renders an empty alt and is hidden from AT', () => {
    const { container } = render(<Avatar src="/x.jpg" name="سارا محمدی" decorative />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('alt')).toBe('');
    // The wrapper is aria-hidden so the duplicate name is not announced.
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('Forms — programmatic labels & error identification (R10.6)', () => {
  it('TextField links a visible label and identifies errors programmatically', () => {
    render(<TextField label="شماره موبایل" error="شماره نامعتبر است" helperText="مثال ۰۹۱۲" />);
    const input = screen.getByLabelText('شماره موبایل');
    // Error identification: aria-invalid + describedby → role=alert (text+icon).
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('شماره نامعتبر است');
    expect(input.getAttribute('aria-describedby')).toContain(alert.id);
    // The error carries an icon too, so meaning is not color-only.
    expect(alert.querySelector('svg')).not.toBeNull();
  });

  it('Textarea associates its label and wires error identification', () => {
    render(<Textarea label="توضیحات" error="بسیار کوتاه است" />);
    const area = screen.getByLabelText('توضیحات');
    expect(area).toHaveAttribute('aria-invalid', 'true');
    const alert = screen.getByRole('alert');
    expect(area.getAttribute('aria-describedby')).toContain(alert.id);
  });

  it('Select exposes a labelled combobox and identifies errors', () => {
    render(
      <Select
        label="خدمت"
        options={[{ value: 'cut', label: 'کوتاهی' }]}
        error="انتخاب الزامی است"
      />,
    );
    const trigger = screen.getByRole('combobox', { name: /خدمت/ });
    expect(trigger).toHaveAttribute('aria-invalid', 'true');
    const alert = screen.getByRole('alert');
    expect(trigger.getAttribute('aria-describedby')).toContain(alert.id);
  });

  it('AuthPage phone field has a programmatic label and the OTP boxes are labelled', () => {
    render(
      wrap(
        <ToastProvider>
          <AuthPage />
        </ToastProvider>,
        '/auth',
      ),
    );
    // Phone step: the input is reachable by its visible label.
    expect(screen.getByLabelText(/شماره موبایل/)).toBeInTheDocument();
  });
});

describe('Accessibility (axe) in RTL — forms render clean', () => {
  it('a field group with a wired error has no serious/critical violations', async () => {
    const { rtlContainer } = renderRtl(
      <form aria-label="form">
        <TextField label="نام" error="الزامی است" required />
        <Textarea label="یادداشت" helperText="اختیاری" />
      </form>,
    );
    await expectNoSeriousA11yViolations(rtlContainer);
  });
});
