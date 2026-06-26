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
