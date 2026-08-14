import { describe, it, expect } from 'vitest';
import { render, within } from '@testing-library/react';
import { EditorialSplit, FeatureMosaic, SectionRhythm } from '..';

/**
 * Structure tests for the editorial layout primitives (task 5.2; R1.4, R2.2,
 * R3.4). They assert the *shape* the primitives promise — asymmetric columns,
 * an uneven lead-plus-support mosaic, and alternating section backgrounds — and
 * that none of them emit a physical inline `left`/`right` class (RTL-safety).
 */

/** Tailwind classes that break RTL (physical inline-axis spacing/position). */
const PHYSICAL_INLINE = /(?:^|[\s:])(?:ml|mr|pl|pr|left|right)-|text-(?:left|right)\b/;

/** Collect the className of every element in a container, space-joined. */
function allClasses(container: HTMLElement): string {
  return Array.from(container.querySelectorAll<HTMLElement>('*'))
    .map((el) => el.getAttribute('class') ?? '')
    .join(' ');
}

describe('EditorialSplit', () => {
  it('renders an asymmetric grid that collapses to one column', () => {
    const { container } = render(
      <EditorialSplit>
        <div>copy</div>
        <div>media</div>
      </EditorialSplit>,
    );
    const root = container.querySelector('[data-layout="editorial-split"]')!;
    expect(root).toBeInTheDocument();
    expect(root.className).toContain('grid');
    expect(root.className).toContain('grid-cols-1');
    // Asymmetric (not 50/50) at md+.
    expect(root.className).toContain('md:grid-cols-[1.4fr_1fr]');
  });

  it('puts the wide column at the inline-end when lead="end"', () => {
    const { container } = render(
      <EditorialSplit lead="end">
        <div>copy</div>
        <div>media</div>
      </EditorialSplit>,
    );
    const root = container.querySelector('[data-layout="editorial-split"]')!;
    expect(root).toHaveAttribute('data-lead', 'end');
    expect(root.className).toContain('md:grid-cols-[1fr_1.4fr]');
  });

  it('renders both columns and no physical left/right classes', () => {
    const { container } = render(
      <EditorialSplit>
        <div>copy</div>
        <div>media</div>
      </EditorialSplit>,
    );
    expect(within(container).getByText('copy')).toBeInTheDocument();
    expect(within(container).getByText('media')).toBeInTheDocument();
    expect(allClasses(container)).not.toMatch(PHYSICAL_INLINE);
  });
});

describe('FeatureMosaic', () => {
  it('marks the first tile as the spanning lead and the rest as support', () => {
    const { container } = render(
      <FeatureMosaic>
        <div>lead</div>
        <div>one</div>
        <div>two</div>
      </FeatureMosaic>,
    );
    const tiles = container.querySelectorAll('[data-mosaic-tile]');
    expect(tiles).toHaveLength(3);
    expect(tiles[0]).toHaveAttribute('data-mosaic-tile', 'lead');
    expect(tiles[0].className).toContain('md:col-span-2');
    // Supporting tiles do not span.
    expect(tiles[1]).toHaveAttribute('data-mosaic-tile', 'support');
    expect(tiles[1].className).not.toContain('col-span-2');
    expect(tiles[2]).toHaveAttribute('data-mosaic-tile', 'support');
  });

  it('renders every tile and no physical left/right classes', () => {
    const { container } = render(
      <FeatureMosaic>
        <div>lead</div>
        <div>one</div>
        <div>two</div>
      </FeatureMosaic>,
    );
    expect(within(container).getByText('lead')).toBeInTheDocument();
    expect(within(container).getByText('one')).toBeInTheDocument();
    expect(within(container).getByText('two')).toBeInTheDocument();
    expect(allClasses(container)).not.toMatch(PHYSICAL_INLINE);
  });
});

describe('SectionRhythm', () => {
  it('alternates band backgrounds across consecutive sections', () => {
    const { container } = render(
      <SectionRhythm>
        <div>a</div>
        <div>b</div>
        <div>c</div>
      </SectionRhythm>,
    );
    const bands = container.querySelectorAll('[data-rhythm-band]');
    expect(bands).toHaveLength(3);
    expect(bands[0]).toHaveAttribute('data-rhythm-band', 'bg');
    expect(bands[1]).toHaveAttribute('data-rhythm-band', 'surface');
    expect(bands[2]).toHaveAttribute('data-rhythm-band', 'bg');
    // Backed by tokens, not literals.
    expect(bands[0].className).toContain('bg-bg');
    expect(bands[1].className).toContain('bg-surface');
  });

  it('can start the rhythm on a surface band', () => {
    const { container } = render(
      <SectionRhythm startWith="surface">
        <div>a</div>
        <div>b</div>
      </SectionRhythm>,
    );
    const bands = container.querySelectorAll('[data-rhythm-band]');
    expect(bands[0]).toHaveAttribute('data-rhythm-band', 'surface');
    expect(bands[1]).toHaveAttribute('data-rhythm-band', 'bg');
  });

  it('varies vertical density and emits no physical left/right classes', () => {
    const { container } = render(
      <SectionRhythm>
        <div>a</div>
        <div>b</div>
      </SectionRhythm>,
    );
    const bands = container.querySelectorAll('[data-rhythm-band]');
    // Consecutive bands differ in block-axis padding.
    expect(bands[0].className).toContain('py-8');
    expect(bands[1].className).toContain('py-10');
    expect(allClasses(container)).not.toMatch(PHYSICAL_INLINE);
  });
});
