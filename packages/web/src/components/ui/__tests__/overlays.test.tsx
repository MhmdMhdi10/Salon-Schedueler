import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from '../Dialog';
import { Sheet, SheetTrigger, SheetContent, SheetTitle } from '../Sheet';
import { Tooltip, TooltipProvider } from '../Tooltip';
import { Button } from '../Button';
import { IconButton } from '../IconButton';
import { renderRtl, expectNoSeriousA11yViolations } from '../../../test/a11y';

/**
 * Component tests for the overlay primitives (Dialog, Sheet, Tooltip).
 * Covers the modal a11y contract — role=dialog + aria-modal, labelling, focus
 * trap/restore, Esc to close — plus axe checks.
 * Requirements: 2.2, 2.5, 2.9, 10.4, 12.4
 */
describe('Dialog', () => {
  function Example() {
    return (
      <Dialog>
        <DialogTrigger asChild>
          <Button>باز کردن</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle>تایید لغو</DialogTitle>
          <DialogDescription>آیا مطمئن هستید؟</DialogDescription>
          <Button>ادامه</Button>
        </DialogContent>
      </Dialog>
    );
  }

  it('opens on trigger and exposes a labelled modal dialog', async () => {
    render(<Example />);
    fireEvent.click(screen.getByRole('button', { name: 'باز کردن' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('تایید لغو');
  });

  it('closes on Escape and restores focus to the trigger', async () => {
    render(<Example />);
    const trigger = screen.getByRole('button', { name: 'باز کردن' });
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('moves focus into the dialog when opened (focus trap entry)', async () => {
    render(<Example />);
    fireEvent.click(screen.getByRole('button', { name: 'باز کردن' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  });

  it('has no serious/critical a11y violations while open', async () => {
    renderRtl(<Example />);
    fireEvent.click(screen.getByRole('button', { name: 'باز کردن' }));
    await screen.findByRole('dialog');
    // Radix portals the dialog outside the RTL wrapper and marks the
    // background wrapper aria-hidden. Audit the visible modal itself.
    await expectNoSeriousA11yViolations(screen.getByRole('dialog'));
  });
});

describe('Sheet', () => {
  function Example() {
    return (
      <Sheet>
        <SheetTrigger asChild>
          <Button>انتخاب زمان</Button>
        </SheetTrigger>
        <SheetContent side="bottom">
          <SheetTitle>زمان‌ها</SheetTitle>
          <Button>بستن</Button>
        </SheetContent>
      </Sheet>
    );
  }

  it('opens a labelled modal sheet and closes on Escape', async () => {
    render(<Example />);
    fireEvent.click(screen.getByRole('button', { name: 'انتخاب زمان' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('زمان‌ها');
    fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('has no serious/critical a11y violations while open', async () => {
    renderRtl(<Example />);
    fireEvent.click(screen.getByRole('button', { name: 'انتخاب زمان' }));
    await screen.findByRole('dialog');
    // Radix portals the sheet outside the RTL wrapper and marks the
    // background wrapper aria-hidden. Audit the visible modal itself.
    await expectNoSeriousA11yViolations(screen.getByRole('dialog'));
  });
});

describe('Tooltip', () => {
  it('shows tooltip content on keyboard focus of the trigger', async () => {
    render(
      <TooltipProvider>
        <Tooltip content="حذف نوبت">
          <IconButton aria-label="حذف نوبت">
            <span />
          </IconButton>
        </Tooltip>
      </TooltipProvider>,
    );
    const trigger = screen.getByRole('button', { name: 'حذف نوبت' });
    fireEvent.focus(trigger);
    // Radix renders the content (it may appear in multiple nodes); assert at least one.
    await waitFor(() => expect(screen.getAllByText('حذف نوبت').length).toBeGreaterThan(0));
  });

  it('has no serious/critical a11y violations', async () => {
    const { rtlContainer } = renderRtl(
      <TooltipProvider>
        <Tooltip content="راهنما">
          <IconButton aria-label="راهنما">
            <span />
          </IconButton>
        </Tooltip>
      </TooltipProvider>,
    );
    await expectNoSeriousA11yViolations(rtlContainer);
  });
});
