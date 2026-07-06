import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SalonPlaceholder } from '../SalonPlaceholder';
import { renderRtl, expectNoSeriousA11yViolations } from '../../../test/a11y';

/**
 * Component tests for `SalonPlaceholder` (task 8.1; Req 9.6).
 * Verifies branded placeholder uses the Motif watermark variant, token-only
 * styling, and correct accessibility attributes (decorative by default).
 */
describe('SalonPlaceholder', () => {
  it('renders the Motif in watermark variant', () => {
    const { container } = render(<SalonPlaceholder />);
    const svg = container.querySelector('svg[data-motif="watermark"]');
    expect(svg).toBeInTheDocument();
  });

  it('uses bg-surface background class for token-driven styling', () => {
    const { container } = render(<SalonPlaceholder />);
    const wrapper = container.firstElementChild!;
    expect(wrapper.className).toContain('bg-surface');
  });

  it('is decorative (aria-hidden) by default when no alt is provided', () => {
    const { container } = render(<SalonPlaceholder />);
    const wrapper = container.firstElementChild!;
    expect(wrapper).toHaveAttribute('aria-hidden', 'true');
    expect(wrapper).not.toHaveAttribute('role');
  });

  it('is exposed as an img with aria-label when alt is provided', () => {
    render(<SalonPlaceholder alt="تصویر جایگزین سالن" />);
    const img = screen.getByRole('img', { name: 'تصویر جایگزین سالن' });
    expect(img).toBeInTheDocument();
    expect(img).not.toHaveAttribute('aria-hidden');
  });

  it('accepts className for custom sizing (aspect-ratio, width, height)', () => {
    const { container } = render(
      <SalonPlaceholder className="aspect-square w-full h-48" />,
    );
    const wrapper = container.firstElementChild!;
    expect(wrapper.className).toContain('aspect-square');
    expect(wrapper.className).toContain('w-full');
    expect(wrapper.className).toContain('h-48');
  });

  it('centers the Motif within the placeholder', () => {
    const { container } = render(<SalonPlaceholder />);
    const wrapper = container.firstElementChild!;
    expect(wrapper.className).toContain('flex');
    expect(wrapper.className).toContain('items-center');
    expect(wrapper.className).toContain('justify-center');
  });

  it('has no serious/critical a11y violations (decorative mode)', async () => {
    const { rtlContainer } = renderRtl(<SalonPlaceholder />);
    await expectNoSeriousA11yViolations(rtlContainer);
  });

  it('has no serious/critical a11y violations (meaningful mode)', async () => {
    const { rtlContainer } = renderRtl(
      <SalonPlaceholder alt="سالن بدون تصویر" />,
    );
    await expectNoSeriousA11yViolations(rtlContainer);
  });
});
