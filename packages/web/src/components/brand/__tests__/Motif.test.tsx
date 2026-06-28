import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Motif, type MotifVariant } from '..';

/**
 * Render tests for the signature brand motif (task 4.2; R1.3).
 *
 * The motif must: render an `<svg>` for every variant, be decorative
 * (`aria-hidden`) by default, and carry **no hard-coded color hex** — its fills
 * come only from design tokens (`var(--color-*)`) and `currentColor` so it
 * re-tints per theme and per tenant accent.
 */

const VARIANTS: MotifVariant[] = ['mark', 'band', 'watermark'];

/** Matches any 3- or 6-digit hex color literal. */
const HEX_LITERAL = /#[0-9a-fA-F]{3,6}\b/;

describe('Motif', () => {
  for (const variant of VARIANTS) {
    describe(`variant="${variant}"`, () => {
      it('renders an <svg>', () => {
        const { container } = render(<Motif variant={variant} />);
        const svg = container.querySelector('svg');
        expect(svg).not.toBeNull();
        expect(svg).toHaveAttribute('data-motif', variant);
      });

      it('is decorative (aria-hidden) by default', () => {
        const { container } = render(<Motif variant={variant} />);
        const svg = container.querySelector('svg');
        expect(svg).toHaveAttribute('aria-hidden', 'true');
        expect(svg).toHaveAttribute('focusable', 'false');
      });

      it('carries no hard-coded color hex', () => {
        const { container } = render(<Motif variant={variant} />);
        const svg = container.querySelector('svg');
        expect(svg?.outerHTML ?? '').not.toMatch(HEX_LITERAL);
      });

      it('colors itself from design tokens', () => {
        const { container } = render(<Motif variant={variant} />);
        const html = container.querySelector('svg')?.outerHTML ?? '';
        expect(html).toContain('var(--color-primary)');
      });
    });
  }

  it('defaults to the mark variant', () => {
    const { container } = render(<Motif />);
    expect(container.querySelector('svg')).toHaveAttribute('data-motif', 'mark');
  });

  it('can opt out of aria-hidden for labelled use', () => {
    const { container } = render(<Motif aria-hidden={false} />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'false');
  });

  it('applies the provided className for sizing', () => {
    const { container } = render(<Motif className="h-8 w-8" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveClass('h-8');
    expect(svg).toHaveClass('w-8');
  });
});
