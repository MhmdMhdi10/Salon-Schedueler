import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import fc from 'fast-check';
import { FunnelShell } from '..';
import { ThemeProvider } from '../../theme';
import '../../../i18n';

/**
 * Brand mark uses the salon's display identity — signature-ui-system Property 8
 * (R4.5).
 *
 * `Feature: signature-ui-system, Property 8: Brand mark uses the salon's display identity`
 *
 * For any salon, the storefront's primary brand mark text equals the salon's
 * configured display name when present and otherwise its stored name, and the
 * platform identifier is rendered subordinately (not as the brand mark). The
 * brand-mark logic lives in `FunnelShell` (the storefront funnel header); this
 * suite drives it with generated names/display names.
 *
 * Validates: Requirements 4.5
 */

/** The platform identifier (`app.title`), which must be subordinate. */
const PLATFORM_IDENTIFIER = 'آرا';

afterEach(() => cleanup());

function renderFunnel(props: { salonName?: string; displayName?: string }) {
  return render(
    <ThemeProvider defaultTheme="light">
      <MemoryRouter>
        <div dir="rtl" lang="fa">
          <FunnelShell currentStep="service" {...props}>
            <p>محتوا</p>
          </FunnelShell>
        </div>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

// Printable, non-empty-after-trim text that never collides with the (Persian)
// platform identifier — fast-check's default `string` is printable ASCII.
const safeText = fc
  .string({ minLength: 1, maxLength: 24 })
  .map((s) => s.replace(/\s+/g, ' ').trim())
  .filter((s) => s.length > 0);

describe('Feature: signature-ui-system, Property 8: Brand mark uses the salon display identity', () => {
  it('renders displayName ?? name as the primary mark, platform identifier subordinate', () => {
    fc.assert(
      fc.property(safeText, fc.option(safeText, { nil: undefined }), (name, displayName) => {
        cleanup();
        renderFunnel({ salonName: name, displayName });

        const expected = displayName ?? name;
        const mark = document.querySelector('[data-funnel-brand-mark]');
        expect(mark).not.toBeNull();
        expect(mark?.textContent).toBe(expected);

        // The platform identifier is present but NOT the brand mark — it sits
        // in a separate, subordinate byline element.
        const platform = screen.getByText(PLATFORM_IDENTIFIER);
        expect(platform).not.toBe(mark);
        expect(mark?.textContent).not.toBe(PLATFORM_IDENTIFIER);
      }),
      { numRuns: 100 },
    );
  });

  it('falls back to the salon name when no display name is configured', () => {
    renderFunnel({ salonName: 'سالن رز' });
    expect(document.querySelector('[data-funnel-brand-mark]')?.textContent).toBe('سالن رز');
  });

  it('with no salon identity, shows only the platform identifier (no brand mark)', () => {
    renderFunnel({});
    expect(document.querySelector('[data-funnel-brand-mark]')).toBeNull();
    expect(screen.getByText(PLATFORM_IDENTIFIER)).toBeInTheDocument();
  });
});
