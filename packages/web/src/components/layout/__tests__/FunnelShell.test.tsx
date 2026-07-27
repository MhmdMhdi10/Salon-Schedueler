import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FunnelShell, FUNNEL_CONTENT_ID } from '..';
import { ThemeProvider } from '../../theme';
import { Button } from '../../ui';
import '../../../i18n';
import { renderRtl, expectNoSeriousA11yViolations } from '../../../test/a11y';

/**
 * Tests for the customer funnel shell: minimal top bar (salon name + back),
 * stepper progress indicator, centered card, and the sticky safe-area-aware
 * bottom CTA. Requirements: 3.1, 3.2, 3.6
 */

function renderFunnel(props: Partial<React.ComponentProps<typeof FunnelShell>> = {}) {
  const { children = <p>محتوای مرحله</p>, currentStep = 'service', ...rest } = props;
  return render(
    <ThemeProvider defaultTheme="light">
      <MemoryRouter>
        <div dir="rtl" lang="fa">
          <FunnelShell currentStep={currentStep} {...rest}>
            {children}
          </FunnelShell>
        </div>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('FunnelShell', () => {
  it('renders the salon name in the top bar', () => {
    renderFunnel({ salonName: 'سالن رز' });
    expect(screen.getByText('سالن رز')).toBeInTheDocument();
  });

  it('falls back to the app title when no salon name is provided', () => {
    renderFunnel();
    expect(screen.getByText('آرا')).toBeInTheDocument();
  });

  it('exposes a single <main> with the funnel content id', () => {
    renderFunnel();
    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', FUNNEL_CONTENT_ID);
    expect(main).toHaveAttribute('tabindex', '-1');
  });

  it('renders the four ordered steps in the progress nav', () => {
    renderFunnel();
    const progress = screen.getByRole('navigation', { name: 'مراحل رزرو' });
    const items = within(progress).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(within(progress).getByText('خدمت')).toBeInTheDocument();
    expect(within(progress).getByText('تاریخ')).toBeInTheDocument();
    expect(within(progress).getByText('زمان')).toBeInTheDocument();
    expect(within(progress).getByText('تایید')).toBeInTheDocument();
  });

  it('marks the active step with aria-current="step"', () => {
    renderFunnel({ currentStep: 'time' });
    const progress = screen.getByRole('navigation', { name: 'مراحل رزرو' });
    const current = progress.querySelectorAll('[aria-current="step"]');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent('زمان');
  });

  it('shows the back affordance only when onBack is provided and calls it', () => {
    const onBack = vi.fn();
    const { rerender } = renderFunnel();
    expect(screen.queryByRole('button', { name: 'بازگشت' })).not.toBeInTheDocument();

    rerender(
      <ThemeProvider defaultTheme="light">
        <MemoryRouter>
          <div dir="rtl" lang="fa">
            <FunnelShell currentStep="date" onBack={onBack}>
              <p>محتوای مرحله</p>
            </FunnelShell>
          </div>
        </MemoryRouter>
      </ThemeProvider>,
    );
    const back = screen.getByRole('button', { name: 'بازگشت' });
    fireEvent.click(back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('renders the sticky CTA bar only when cta content is supplied', () => {
    const { rerender } = renderFunnel();
    expect(screen.queryByTestId('funnel-cta-bar')).not.toBeInTheDocument();

    rerender(
      <ThemeProvider defaultTheme="light">
        <MemoryRouter>
          <div dir="rtl" lang="fa">
            <FunnelShell currentStep="confirm" cta={<Button>تایید رزرو</Button>}>
              <p>محتوای مرحله</p>
            </FunnelShell>
          </div>
        </MemoryRouter>
      </ThemeProvider>,
    );
    const bar = screen.getByTestId('funnel-cta-bar');
    expect(within(bar).getByRole('button', { name: 'تایید رزرو' })).toBeInTheDocument();
  });

  it('has no serious/critical a11y violations in RTL', async () => {
    const { rtlContainer } = renderRtl(
      <ThemeProvider defaultTheme="light">
        <MemoryRouter>
          <FunnelShell
            currentStep="service"
            salonName="سالن رز"
            onBack={() => {}}
            cta={<Button>ادامه</Button>}
          >
            <h1>انتخاب خدمت</h1>
          </FunnelShell>
        </MemoryRouter>
      </ThemeProvider>,
    );
    await expectNoSeriousA11yViolations(rtlContainer);
  });
});
