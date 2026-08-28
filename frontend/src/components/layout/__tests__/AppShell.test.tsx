import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppShell, MAIN_CONTENT_ID } from '..';
import { ThemeProvider } from '../../theme';
import { AuthProvider } from '../../../auth/AuthContext';
import '../../../i18n';
import { renderRtl, expectNoSeriousA11yViolations } from '../../../test/a11y';

const mockGetMe = vi.hoisted(() => vi.fn());

vi.mock('../../../api/client', () => ({
  bootstrapAuth: vi.fn().mockResolvedValue(true),
  getAccessToken: vi.fn().mockReturnValue('access-token'),
  meApi: { getMe: mockGetMe },
  signOut: vi.fn(),
}));

/**
 * Tests for the application shell: header / single `<main>` / footer landmarks,
 * the skip-to-content link, RTL-first responsive layout, and accessibility.
 * Requirements: 3.1, 3.2, 3.5, 3.8
 */

function renderShell(children: React.ReactNode = <p>محتوا</p>) {
  return render(
    <ThemeProvider defaultTheme="light">
      <MemoryRouter initialEntries={['/about']}>
        <div dir="rtl" lang="fa">
          <AppShell>{children}</AppShell>
        </div>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('AppShell', () => {
  it('renders the header, single main, and footer landmarks', () => {
    renderShell();

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();

    const mains = screen.getAllByRole('main');
    expect(mains).toHaveLength(1);
  });

  it('hides the public footer on the customer account dashboard', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <MemoryRouter initialEntries={['/account']}>
          <div dir="rtl" lang="fa">
            <AppShell>
              <p>حساب من</p>
            </AppShell>
          </div>
        </MemoryRouter>
      </ThemeProvider>,
    );

    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
  });

  it('shows only the salon-panel switcher in an owner account header', async () => {
    mockGetMe.mockResolvedValue({
      principal: { id: 'owner-1', role: 'Owner', salonId: 'salon-1' },
    });

    render(
      <ThemeProvider defaultTheme="light">
        <MemoryRouter initialEntries={['/account']}>
          <AuthProvider>
            <div dir="rtl" lang="fa">
              <AppShell>
                <p>حساب من</p>
              </AppShell>
            </div>
          </AuthProvider>
        </MemoryRouter>
      </ThemeProvider>,
    );

    const banner = screen.getByRole('banner');
    const salonPanel = await within(banner).findByRole('link', { name: 'پنل سالن' });
    expect(salonPanel).toHaveAttribute('href', '/owner');
    expect(within(banner).getByRole('button', { name: 'اعلان‌ها' })).toBeInTheDocument();
    expect(within(banner).queryByRole('link', { name: 'حساب کاربری' })).not.toBeInTheDocument();
    expect(within(banner).queryByRole('link', { name: 'تقویم' })).not.toBeInTheDocument();
    expect(within(banner).queryByRole('link', { name: 'آمار' })).not.toBeInTheDocument();
    expect(within(banner).queryByRole('link', { name: 'تنظیمات سالن' })).not.toBeInTheDocument();
    expect(within(banner).queryByRole('link', { name: 'QR و استند' })).not.toBeInTheDocument();
  });

  it('shows all three panel destinations for a platform administrator', async () => {
    mockGetMe.mockResolvedValue({
      principal: { id: 'platform-admin-1', role: 'PlatformAdmin' },
    });

    render(
      <ThemeProvider defaultTheme="light">
        <MemoryRouter initialEntries={['/account']}>
          <AuthProvider>
            <div dir="rtl" lang="fa">
              <AppShell>
                <p>پنل ادمین</p>
              </AppShell>
            </div>
          </AuthProvider>
        </MemoryRouter>
      </ThemeProvider>,
    );

    const banner = screen.getByRole('banner');
    expect(await within(banner).findByRole('link', { name: 'پنل سالن' })).toHaveAttribute(
      'href',
      '/owner',
    );
    expect(within(banner).getByRole('link', { name: 'پنل کاربری' })).toHaveAttribute(
      'href',
      '/account',
    );
    expect(within(banner).getByRole('link', { name: 'پنل ادمین' })).toHaveAttribute(
      'href',
      '/platform-admin',
    );
  });

  it('exposes a single <main> with the skip-link target id', () => {
    renderShell();
    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', MAIN_CONTENT_ID);
    // Focusable so the skip link can move focus into it.
    expect(main).toHaveAttribute('tabindex', '-1');
  });

  it('renders a skip-to-content link that targets the main region', () => {
    renderShell();
    const skip = screen.getByRole('link', { name: 'رفتن به محتوای اصلی' });
    expect(skip).toHaveAttribute('href', `#${MAIN_CONTENT_ID}`);
  });

  it('provides a primary navigation landmark with a home link', () => {
    renderShell();
    const nav = screen.getByRole('navigation', { name: 'ناوبری اصلی' });
    const home = within(nav).getByRole('link', { name: 'آرا' });
    expect(home).toHaveAttribute('href', '/');
  });

  it('hosts the theme toggle in the header', () => {
    renderShell();
    const banner = screen.getByRole('banner');
    expect(within(banner).getByRole('button', { name: /تغییر به حالت/ })).toBeInTheDocument();
  });

  it('renders the routed page content inside main', () => {
    renderShell(<p data-testid="page-body">صفحه آزمایشی</p>);
    const main = screen.getByRole('main');
    expect(within(main).getByTestId('page-body')).toBeInTheDocument();
  });

  it('does not expose marketplace navigation during the owner-first launch', () => {
    renderShell();
    expect(screen.queryByRole('navigation', { name: 'دسته‌بندی خدمات' })).not.toBeInTheDocument();
    expect(document.querySelector('a[href="/search"]')).not.toBeInTheDocument();
    expect(document.querySelector('a[href^="/services/"]')).not.toBeInTheDocument();
  });

  it('footer contains only real link targets (no #download, no dead anchors)', () => {
    renderShell();
    const footer = screen.getByRole('contentinfo');
    const links = within(footer).getAllByRole('link');
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      const href = link.getAttribute('href') ?? '';
      if (href.startsWith('https://trustseal.enamad.ir/')) {
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).not.toHaveAttribute('rel');
        continue;
      }
      // Every footer destination is an internal route — never a hash stub.
      expect(href.startsWith('/'), `dead footer link: ${href}`).toBe(true);
    }
  });

  it('renders the eNamad trust seal with its signed provider URLs', () => {
    renderShell();

    const seal = document.querySelector<HTMLAnchorElement>(
      'a[href="https://trustseal.enamad.ir/?id=7396256&Code=9VvZMqffMTky88WMBv1WJpNzNafnVCyo"]',
    );
    expect(seal).toBeInTheDocument();
    expect(seal).toHaveAttribute(
      'href',
      'https://trustseal.enamad.ir/?id=7396256&Code=9VvZMqffMTky88WMBv1WJpNzNafnVCyo',
    );
    expect(seal).toHaveAttribute('referrerpolicy', 'origin');
    expect(seal).toHaveAttribute('target', '_blank');
    expect(seal).not.toHaveAttribute('rel');

    const logo = seal?.querySelector<HTMLImageElement>('img');
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveAttribute(
      'src',
      'https://trustseal.enamad.ir/logo.aspx?id=7396256&Code=9VvZMqffMTky88WMBv1WJpNzNafnVCyo',
    );
    expect(logo).toHaveAttribute('alt', '');
    expect(logo?.style.cursor).toBe('pointer');
    expect(logo).toHaveAttribute('code', '9VvZMqffMTky88WMBv1WJpNzNafnVCyo');
  });

  it('home uses the business header with sign-in and registration actions', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <MemoryRouter initialEntries={['/']}>
          <div dir="rtl" lang="fa">
            <AppShell>
              <p>محتوا</p>
            </AppShell>
          </div>
        </MemoryRouter>
      </ThemeProvider>,
    );
    const banner = screen.getByRole('banner');
    expect(within(banner).getByRole('link', { name: 'ورود به حساب' })).toHaveAttribute(
      'href',
      '/auth',
    );
    // The inert flag/country dropdown is gone.
    expect(within(banner).queryByText('ایران')).not.toBeInTheDocument();
    // Theme toggle is reachable from home too.
    expect(within(banner).getByRole('button', { name: /تغییر به حالت/ })).toBeInTheDocument();
    expect(within(banner).getByRole('link', { name: 'رایگان امتحان کنید' })).toHaveAttribute(
      'href',
      '/business/register',
    );
  });

  it('has no serious/critical a11y violations in RTL', async () => {
    const { rtlContainer } = renderRtl(
      <ThemeProvider defaultTheme="light">
        <MemoryRouter initialEntries={['/about']}>
          <AppShell>
            <h1>عنوان صفحه</h1>
          </AppShell>
        </MemoryRouter>
      </ThemeProvider>,
    );
    await expectNoSeriousA11yViolations(rtlContainer);
  });
});
