import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Num, toPersianDigits } from '../Num';
import { Money, formatRial } from '../Money';
import { JalaliDate, formatJalaliDisplay } from '../JalaliDate';
import { DirText } from '../DirText';
import { renderRtl, expectNoSeriousA11yViolations } from '../../../test/a11y';

/**
 * Component tests for the Persian display-formatting / bidi primitives.
 * Covers Persian digit rendering, Rial formatting + Toman conversion, Jalali
 * date rendering with a machine-readable ISO dateTime, bidi isolation, and axe.
 * Requirements: 2.2, 2.9, 10.4, 12.4
 */
describe('Num', () => {
  it('renders Persian digits inside a bidi-isolated element', () => {
    const { container } = render(<Num value={1404} />);
    const bdi = container.querySelector('bdi')!;
    expect(bdi).toBeInTheDocument();
    expect(bdi).toHaveTextContent('۱۴۰۴');
  });

  it('toPersianDigits localizes digits but keeps separators', () => {
    expect(toPersianDigits('09:30')).toBe('۰۹:۳۰');
    expect(toPersianDigits(3)).toBe('۳');
  });

  it('applies tabular numerals so figures share a consistent advance width', () => {
    const { container } = render(<Num value={1234} />);
    const bdi = container.querySelector('bdi')!;
    // Baseline alignment everywhere, not only in aligned columns (R8.3).
    expect(bdi).toHaveClass('tabular-nums');
  });

  it('merges caller className with the tabular-nums default', () => {
    const { container } = render(<Num value={5} className="text-muted" />);
    const bdi = container.querySelector('bdi')!;
    expect(bdi).toHaveClass('tabular-nums');
    expect(bdi).toHaveClass('text-muted');
  });
});

describe('Money', () => {
  it('renders grouped Persian-digit Rial with the unit label', () => {
    render(<Money amountRial={2500000n} />);
    expect(screen.getByText(/ریال/)).toBeInTheDocument();
    // 2,500,000 → Persian digits with the Persian group separator.
    expect(screen.getByText(/۲٬۵۰۰٬۰۰۰/)).toBeInTheDocument();
  });

  it('toman variant divides by 10 for display only and labels تومان', () => {
    render(<Money amountRial={2500000n} unit="toman" />);
    expect(screen.getByText(/تومان/)).toBeInTheDocument();
    expect(screen.getByText(/۲۵۰٬۰۰۰/)).toBeInTheDocument();
  });

  it('formatRial groups thousands with Persian digits', () => {
    expect(formatRial(1234567n)).toBe('۱٬۲۳۴٬۵۶۷');
  });

  it('has no serious/critical a11y violations', async () => {
    const { rtlContainer } = renderRtl(<Money amountRial={2500000n} />);
    await expectNoSeriousA11yViolations(rtlContainer);
  });
});

describe('JalaliDate', () => {
  it('renders a Jalali date with Persian month name and Persian digits', () => {
    // 2025-05-07 → 17 Ordibehesht 1404.
    render(<JalaliDate value="2025-05-07" />);
    const el = screen.getByText(/اردیبهشت/);
    expect(el).toHaveTextContent('۱۷ اردیبهشت ۱۴۰۴');
  });

  it('emits a semantic <time> with a machine-readable ISO dateTime', () => {
    render(<JalaliDate value="2025-05-07" />);
    const el = screen.getByText(/اردیبهشت/);
    expect(el.tagName.toLowerCase()).toBe('time');
    expect(el).toHaveAttribute('datetime', '2025-05-07');
  });

  it('numeric variant renders the slash-separated Jalali form', () => {
    expect(formatJalaliDisplay('2025-05-07', 'numeric')).toBe('۱۴۰۴/۰۲/۱۷');
  });

  it('withWeekday prefixes the Persian weekday name', () => {
    // 2025-05-07 is a Wednesday → چهارشنبه.
    expect(formatJalaliDisplay('2025-05-07', 'long', true)).toContain('چهارشنبه');
  });

  it('has no serious/critical a11y violations', async () => {
    const { rtlContainer } = renderRtl(<JalaliDate value="2025-05-07" withWeekday />);
    await expectNoSeriousA11yViolations(rtlContainer);
  });
});

describe('DirText', () => {
  it('isolates mixed-direction runs inside a bdi with the chosen dir', () => {
    const { container } = render(<DirText dir="ltr">zarinpal.com</DirText>);
    const bdi = container.querySelector('bdi')!;
    expect(bdi).toHaveAttribute('dir', 'ltr');
    expect(bdi).toHaveTextContent('zarinpal.com');
  });

  it('defaults to dir="auto" so the run base direction is detected per content', () => {
    const { container } = render(<DirText>support@salon.ir</DirText>);
    const bdi = container.querySelector('bdi')!;
    expect(bdi.tagName.toLowerCase()).toBe('bdi');
    expect(bdi).toHaveAttribute('dir', 'auto');
  });
});

/**
 * R8.4 — mixed LTR/RTL runs (a URL or email embedded in Persian copy, a
 * localized number next to Latin text) are isolated in a `<bdi>` so the
 * surrounding RTL layout cannot reorder them and adjacent punctuation does not
 * jump (ui-ux §11 bidi handling). `<bdi>` carries `unicode-bidi: isolate`
 * natively, so wrapping the Latin/numeric run is the isolation contract.
 */
describe('bidi isolation of mixed runs (R8.4)', () => {
  it('wraps a Latin URL embedded in a Persian sentence in its own <bdi>', () => {
    const { container } = render(
      <p>
        درگاه پرداخت <DirText>zarinpal.com</DirText> را باز می‌کند
      </p>,
    );
    // The Latin run lives in its own isolation boundary, separate from the
    // surrounding Persian text nodes.
    const bdi = container.querySelector('bdi')!;
    expect(bdi).toBeInTheDocument();
    expect(bdi).toHaveTextContent('zarinpal.com');
    // The Persian copy stays outside the isolated run.
    expect(bdi.textContent).not.toContain('درگاه');
  });

  it('isolates a forced-LTR phone fragment inside RTL copy', () => {
    const { container } = render(
      <p>
        شماره تماس <DirText dir="ltr">+98 912 000 0000</DirText>
      </p>,
    );
    const bdi = container.querySelector('bdi')!;
    expect(bdi).toHaveAttribute('dir', 'ltr');
    expect(bdi).toHaveTextContent('+98 912 000 0000');
  });

  it('Num isolates a localized number sitting next to Latin/Persian text', () => {
    const { container } = render(
      <p>
        نسخه <Num value={1404} /> build
      </p>,
    );
    const bdi = container.querySelector('bdi')!;
    expect(bdi).toBeInTheDocument();
    expect(bdi).toHaveTextContent('۱۴۰۴');
  });

  it('Money isolates the grouped amount + unit pair from surrounding copy', () => {
    const { container } = render(
      <p>
        مبلغ <Money amountRial={2500000n} /> است
      </p>,
    );
    const bdi = container.querySelector('bdi')!;
    expect(bdi).toBeInTheDocument();
    expect(bdi).toHaveTextContent('۲٬۵۰۰٬۰۰۰');
    expect(bdi).toHaveTextContent('ریال');
  });
});
