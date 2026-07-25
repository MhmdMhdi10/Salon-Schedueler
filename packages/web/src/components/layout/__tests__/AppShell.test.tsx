import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppShell, MAIN_CONTENT_ID } from '..';
import { ThemeProvider } from '../../theme';
import '../../../i18n';
import { renderRtl, expectNoSeriousA11yViolations } from '../../../test/a11y';

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
    expect(
      within(banner).getByRole('button', { name: /تغییر به حالت/ }),
    ).toBeInTheDocument();
  });

  it('renders the routed page content inside main', () => {
    renderShell(<p data-testid="page-body">صفحه آزمایشی</p>);
    const main = screen.getByRole('main');
    expect(within(main).getByTestId('page-body')).toBeInTheDocument();
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
