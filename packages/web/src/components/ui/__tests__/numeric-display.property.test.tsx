import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import fc from 'fast-check';
import { Num } from '../Num';
import { Money, type MoneyUnit } from '../Money';

/**
 * Feature: signature-ui-system, Property 14: Numeric display is Persian and
 * tabular.
 *
 * For ALL user-facing numeric values (prices, dates, counts, timers, calendar
 * cells, analytics figures), the rendered digits are Persian/Eastern-Arabic
 * numerals (۰۱۲۳۴۵۶۷۸۹) — never ASCII `0-9` — and the rendering element carries
 * tabular (consistent-advance) figures so columns and timers align on a stable
 * baseline everywhere, not only inside aligned columns.
 *
 * `<Num>` and `<Money>` are the two Component_Library primitives every numeric
 * display routes through, so this suite drives fast-check across arbitrary
 * integers/amounts and asserts the invariant on the actual rendered output.
 *
 * Validates: Requirements 5.1, 8.3
 */

/** The ten Persian/Eastern-Arabic digit glyphs. */
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
/** Any ASCII Western digit — must never appear in a user-facing numeric. */
const ASCII_DIGIT = /[0-9]/;
/** A rendered numeric must contain at least one localized digit. */
const ANY_PERSIAN_DIGIT = new RegExp(`[${PERSIAN_DIGITS}]`);

/**
 * Asserts a rendered `<bdi>` numeric satisfies Property 14: it applies the
 * tabular-figures treatment and its text contains Persian digits with no ASCII
 * digit anywhere in the visible output.
 */
function expectPersianAndTabular(bdi: HTMLElement | null) {
  expect(bdi).not.toBeNull();
  // Tabular figures: consistent advance width for baseline alignment (R8.3).
  expect(bdi!.className).toMatch(/\btabular-nums\b/);
  expect(bdi!.className).toMatch(/font-feature-settings:"tnum"/);

  const text = bdi!.textContent ?? '';
  // No Western digits leak into a user-facing numeric (R8.3 / Property 14).
  expect(text).not.toMatch(ASCII_DIGIT);
  // The localized output actually carries Persian digits.
  expect(text).toMatch(ANY_PERSIAN_DIGIT);
}

describe('Property 14 — <Num> renders Persian digits with tabular figures', () => {
  it('localizes any integer to Persian digits and keeps no ASCII digit', () => {
    fc.assert(
      fc.property(fc.integer(), (value) => {
        const { container, unmount } = render(<Num value={value} />);
        try {
          expectPersianAndTabular(container.querySelector('bdi'));
        } finally {
          unmount();
        }
      }),
      { numRuns: 300 },
    );
  });

  it('localizes pre-formatted numeric strings (times, dates) without ASCII digits', () => {
    const numericString = fc
      .tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }))
      .map(([h, m]) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);

    fc.assert(
      fc.property(numericString, (value) => {
        const { container, unmount } = render(<Num value={value} />);
        try {
          const bdi = container.querySelector('bdi');
          expectPersianAndTabular(bdi);
          // The non-digit separator survives localization.
          expect(bdi!.textContent).toContain(':');
        } finally {
          unmount();
        }
      }),
      { numRuns: 200 },
    );
  });

  it('preserves the tabular treatment when caller appends classes', () => {
    fc.assert(
      fc.property(fc.integer(), (value) => {
        const { container, unmount } = render(<Num value={value} className="text-muted text-sm" />);
        try {
          const bdi = container.querySelector('bdi');
          expectPersianAndTabular(bdi);
          expect(bdi!.className).toMatch(/\btext-muted\b/);
        } finally {
          unmount();
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe('Property 14 — <Money> renders Persian digits + grouping with tabular figures', () => {
  const UNITS: MoneyUnit[] = ['rial', 'toman'];

  it('renders any Rial amount as Persian digits + group separators, no ASCII digit', () => {
    fc.assert(
      fc.property(
        // bigint covers the full machine range (Service.priceRial is bigint).
        fc.bigInt({ min: 0n, max: 10n ** 18n }),
        fc.constantFrom(...UNITS),
        fc.boolean(),
        (amountRial, unit, hideUnit) => {
          const { container, unmount } = render(
            <Money amountRial={amountRial} unit={unit} hideUnit={hideUnit} />,
          );
          try {
            expectPersianAndTabular(container.querySelector('bdi'));
          } finally {
            unmount();
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('uses the Persian group separator for amounts ≥ 1000 (never the Latin comma)', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1000n, max: 10n ** 15n }), (amountRial) => {
        const { container, unmount } = render(
          <Money amountRial={amountRial} unit="rial" hideUnit />,
        );
        try {
          const bdi = container.querySelector('bdi');
          expectPersianAndTabular(bdi);
          const text = bdi!.textContent ?? '';
          // Grouping uses the Arabic thousands separator (U+066C), not ','.
          expect(text).toContain('٬');
          expect(text).not.toContain(',');
        } finally {
          unmount();
        }
      }),
      { numRuns: 200 },
    );
  });

  it('keeps Persian digits + tabular figures even when the unit label is shown', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10n ** 12n }),
        fc.constantFrom(...UNITS),
        (amountRial, unit) => {
          const { container, unmount } = render(<Money amountRial={amountRial} unit={unit} />);
          try {
            const bdi = container.querySelector('bdi');
            expectPersianAndTabular(bdi);
            // The localized unit label («ریال»/«تومان») carries no ASCII digit.
            const label = unit === 'toman' ? 'تومان' : 'ریال';
            expect(bdi!.textContent).toContain(label);
          } finally {
            unmount();
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
