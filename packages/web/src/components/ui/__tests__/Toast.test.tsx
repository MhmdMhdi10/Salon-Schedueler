import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider, useToast } from '../Toast';
import { Button } from '../Button';
import { renderRtl, expectNoSeriousA11yViolations } from '../../../test/a11y';

/**
 * Component tests for the Toast system.
 * Covers showing a toast imperatively, the optional undo affordance, and axe.
 * Requirements: 2.2, 10.4, 12.4
 */
function Harness() {
  const { success } = useToast();
  return (
    <Button
      onClick={() =>
        success({ title: 'کد ارسال شد', description: 'تا ۴۵ ثانیه دیگر' })
      }
    >
      ارسال
    </Button>
  );
}

describe('Toast', () => {
  it('shows a toast with title + description when triggered', async () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'ارسال' }));
    await waitFor(() =>
      expect(screen.getByText('کد ارسال شد')).toBeInTheDocument(),
    );
    expect(screen.getByText('تا ۴۵ ثانیه دیگر')).toBeInTheDocument();
  });

  it('renders an undo action that fires onUndo', async () => {
    const onUndo = vi.fn();
    function UndoHarness() {
      const { toast } = useToast();
      return (
        <Button onClick={() => toast({ title: 'حذف شد', onUndo })}>
          حذف
        </Button>
      );
    }
    render(
      <ToastProvider>
        <UndoHarness />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'حذف' }));
    const undo = await screen.findByRole('button', { name: 'بازگردانی' });
    fireEvent.click(undo);
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('has no serious/critical a11y violations while a toast is visible', async () => {
    const { rtlContainer } = renderRtl(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'ارسال' }));
    await waitFor(() =>
      expect(screen.getByText('کد ارسال شد')).toBeInTheDocument(),
    );
    await expectNoSeriousA11yViolations(rtlContainer);
  });
});

/**
 * R7.5 — the explicit success confirmation is announced through an ARIA live
 * region. Status/info announce politely (`role="status"` + `aria-live="polite"`)
 * so a success toast never interrupts the user, while errors announce
 * assertively (`aria-live="assertive"`). This keeps the success moment
 * perceivable without sight (ui-ux §7 success confirmation, §10 live regions).
 */
describe('Toast — success via live region (R7.5)', () => {
  /** Collect every live region currently in the document. */
  function liveRegions() {
    return Array.from(
      document.querySelectorAll<HTMLElement>('[role="status"][aria-live]'),
    );
  }

  it('announces a success toast through a polite live region', async () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'ارسال' }));

    // The success confirmation text is mirrored into a polite live region…
    await waitFor(() => {
      const polite = liveRegions().filter(
        (el) => el.getAttribute('aria-live') === 'polite',
      );
      expect(
        polite.some((el) => el.textContent?.includes('کد ارسال شد')),
      ).toBe(true);
    });

    // …and it is NOT announced assertively (success must not interrupt).
    const assertive = liveRegions().filter(
      (el) => el.getAttribute('aria-live') === 'assertive',
    );
    expect(
      assertive.some((el) => el.textContent?.includes('کد ارسال شد')),
    ).toBe(false);
  });

  it('announces an error toast assertively', async () => {
    function ErrorHarness() {
      const { error } = useToast();
      return (
        <Button onClick={() => error({ title: 'پرداخت ناموفق' })}>
          خطا
        </Button>
      );
    }
    render(
      <ToastProvider>
        <ErrorHarness />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'خطا' }));

    await waitFor(() => {
      const assertive = liveRegions().filter(
        (el) => el.getAttribute('aria-live') === 'assertive',
      );
      expect(
        assertive.some((el) => el.textContent?.includes('پرداخت ناموفق')),
      ).toBe(true);
    });
  });
});
