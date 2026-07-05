import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BookingStepper } from '../BookingStepper';

/**
 * Unit tests for the BookingStepper component (Task 6.1; Req 7.1).
 *
 * Covers: step rendering with Persian numerals, RTL flow, accessibility
 * attributes (role="list", role="listitem", aria-current="step"), visual
 * states (completed/active/upcoming), connector lines, and touch target sizing.
 */

const STEPS = [
  { key: 'service', label: 'خدمت' },
  { key: 'date', label: 'تاریخ' },
  { key: 'time', label: 'زمان' },
  { key: 'confirm', label: 'تایید' },
];

describe('BookingStepper', () => {
  it('renders all step labels in Persian', () => {
    render(<BookingStepper steps={STEPS} currentStep={0} />);
    expect(screen.getByText('خدمت')).toBeInTheDocument();
    expect(screen.getByText('تاریخ')).toBeInTheDocument();
    expect(screen.getByText('زمان')).toBeInTheDocument();
    expect(screen.getByText('تایید')).toBeInTheDocument();
  });

  it('uses role="list" on the container and role="listitem" on each step', () => {
    render(<BookingStepper steps={STEPS} currentStep={1} />);
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
  });

  it('sets aria-current="step" on the current step only', () => {
    render(<BookingStepper steps={STEPS} currentStep={2} />);
    const items = screen.getAllByRole('listitem');
    // Step 0 and 1 are completed, step 2 is current, step 3 is upcoming
    expect(items[0]).not.toHaveAttribute('aria-current');
    expect(items[1]).not.toHaveAttribute('aria-current');
    expect(items[2]).toHaveAttribute('aria-current', 'step');
    expect(items[3]).not.toHaveAttribute('aria-current');
  });

  it('displays Persian numeral for current/upcoming steps', () => {
    render(<BookingStepper steps={STEPS} currentStep={1} />);
    // Step 2 (index 1) is current — should show ۲
    expect(screen.getByText('۲')).toBeInTheDocument();
    // Step 3 and 4 are upcoming — should show ۳ and ۴
    expect(screen.getByText('۳')).toBeInTheDocument();
    expect(screen.getByText('۴')).toBeInTheDocument();
  });

  it('shows checkmark SVG for completed steps (not a number)', () => {
    const { container } = render(<BookingStepper steps={STEPS} currentStep={2} />);
    // Steps 0 and 1 are completed — they should have SVG checkmarks
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBe(2);
    // Step 2 (current) and step 3 (upcoming) should show numbers not SVGs
    expect(screen.getByText('۳')).toBeInTheDocument();
    expect(screen.getByText('۴')).toBeInTheDocument();
  });

  it('has an accessible nav landmark with a Persian aria-label', () => {
    render(<BookingStepper steps={STEPS} currentStep={0} />);
    const nav = screen.getByRole('navigation');
    expect(nav).toHaveAttribute('aria-label', 'مراحل رزرو');
  });

  it('step circles meet touch target minimum (h-11 = 44px)', () => {
    const { container } = render(<BookingStepper steps={STEPS} currentStep={0} />);
    // All circle divs should have the h-11 w-11 classes (44px)
    const circles = container.querySelectorAll('.h-11.w-11');
    expect(circles.length).toBe(4);
  });

  it('renders connector lines between steps (not after the last)', () => {
    const { container } = render(<BookingStepper steps={STEPS} currentStep={0} />);
    // There should be 3 connector containers (between 4 steps)
    const connectors = container.querySelectorAll('[aria-hidden="true"]');
    // Connectors + possible pulse ring — at minimum 3 connector divs
    expect(connectors.length).toBeGreaterThanOrEqual(3);
  });

  it('applies primary color classes to completed step labels', () => {
    render(<BookingStepper steps={STEPS} currentStep={2} />);
    const serviceLabel = screen.getByText('خدمت');
    expect(serviceLabel.className).toContain('text-primary');
  });

  it('applies muted color classes to upcoming step labels', () => {
    render(<BookingStepper steps={STEPS} currentStep={0} />);
    const confirmLabel = screen.getByText('تایید');
    expect(confirmLabel.className).toContain('text-text-muted');
  });

  it('renders correctly with a single step', () => {
    const singleStep = [{ key: 'only', label: 'تنها' }];
    render(<BookingStepper steps={singleStep} currentStep={0} />);
    expect(screen.getByText('تنها')).toBeInTheDocument();
    expect(screen.getByText('۱')).toBeInTheDocument();
  });

  it('applies custom className to the root container', () => {
    const { container } = render(
      <BookingStepper steps={STEPS} currentStep={0} className="my-custom-class" />,
    );
    const nav = container.querySelector('nav');
    expect(nav?.className).toContain('my-custom-class');
  });
});
