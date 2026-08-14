import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '../Button';
import { IconButton } from '../IconButton';
import { renderRtl, expectNoSeriousA11yViolations } from '../../../test/a11y';

/**
 * Component tests for Button + IconButton primitives.
 * Covers the interactive-state set (default/disabled/loading), the loading
 * a11y contract (aria-busy + disabled), and axe checks.
 * Requirements: 2.2, 2.9, 10.4, 12.4
 */
describe('Button', () => {
  it('renders its label and fires onClick in the default state', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>تایید رزرو</Button>);
    const btn = screen.getByRole('button', { name: 'تایید رزرو' });
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(btn).not.toBeDisabled();
    expect(btn).not.toHaveAttribute('aria-busy');
  });

  it('loading state sets aria-busy, disables the button, and blocks clicks', () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        دریافت کد
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'دریافت کد' });
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('disabled state prevents interaction', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        غیرفعال
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'غیرفعال' });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('defaults to type="button" so it never submits a form unexpectedly', () => {
    render(<Button>x</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('has no serious/critical a11y violations', async () => {
    const { rtlContainer } = renderRtl(
      <Button startIcon={<span />} endIcon={<span />}>
        تایید
      </Button>,
    );
    await expectNoSeriousA11yViolations(rtlContainer);
  });
});

describe('IconButton', () => {
  it('exposes its required accessible name', () => {
    render(
      <IconButton aria-label="بستن">
        <span />
      </IconButton>,
    );
    expect(screen.getByRole('button', { name: 'بستن' })).toBeInTheDocument();
  });

  it('loading sets aria-busy + disabled', () => {
    render(
      <IconButton aria-label="حذف" loading>
        <span />
      </IconButton>,
    );
    const btn = screen.getByRole('button', { name: 'حذف' });
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(btn).toBeDisabled();
  });

  it('has no serious/critical a11y violations', async () => {
    const { rtlContainer } = renderRtl(
      <IconButton aria-label="حذف نوبت">
        <span />
      </IconButton>,
    );
    await expectNoSeriousA11yViolations(rtlContainer);
  });
});
