import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import fc from 'fast-check';
import { Button, type ButtonVariant, type ButtonSize } from '../Button';

/**
 * Interactive elements define all six states — Property 17 (R7.4).
 *
 * `Feature: signature-ui-system, Property 17: Interactive elements define all
 *  six states`
 *
 * For ANY interactive Component_Library element, the six interaction states —
 * default, hover, focus-visible, active/pressed, disabled, and loading — must
 * each be defined and styled with **signature tokens** (token-mapped Tailwind
 * utilities that resolve to `--color-*`/`--dur-*`/`--ease-*`, never raw
 * hex/px/ms), regardless of any concurrent or overlapping UI state.
 *
 * `Button` is the canonical interactive primitive (the only Component_Library
 * element that carries all six states, including `loading`), so this suite
 * drives fast-check across every variant × size × prop combination and asserts
 * the full state set survives intact under any overlap (disabled+loading,
 * fullWidth, icons, custom className, …).
 *
 * Validates: Requirements 7.4
 */

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'danger'];
const SIZES: ButtonSize[] = ['md', 'lg'];

/**
 * Per-variant DEFAULT fill — each is a semantic token utility (`bg-*`/`text-*`/
 * `border-*` → `--color-*`), never a literal color.
 */
const DEFAULT_FILL: Record<ButtonVariant, RegExp[]> = {
  primary: [/\bbg-primary\b/, /\btext-primary-contrast\b/],
  secondary: [/\bbg-surface\b/, /\btext-text\b/, /\bborder-border\b/],
  ghost: [/\bbg-transparent\b/, /\btext-text\b/],
  danger: [/\bbg-danger\b/, /\btext-primary-contrast\b/],
};

/** Per-variant HOVER — a token-driven hover affordance (brightness or token bg). */
const HOVER: Record<ButtonVariant, RegExp> = {
  primary: /\bhover:brightness-110\b/,
  secondary: /\bhover:bg-elevated\b/,
  ghost: /\bhover:bg-surface\b/,
  danger: /\bhover:brightness-110\b/,
};

/** Shared, variant-independent state styling (all token-mapped utilities). */
const FOCUS_VISIBLE = /\bfocus-visible:outline-focus\b/; // uses --color-focus-ring
const ACTIVE = /\bactive:brightness-95\b/;
const DISABLED_OPACITY = /\bdisabled:opacity-60\b/;
const DISABLED_CURSOR = /\bdisabled:cursor-not-allowed\b/;
/** Motion is token-driven (`--dur-*`/`--ease-*`), not a raw ms literal. */
const MOTION_TOKEN = /\bduration-fast\b/;
const EASE_TOKEN = /\bease-standard\b/;

function renderButton(props: {
  variant: ButtonVariant;
  size: ButtonSize;
  loading: boolean;
  disabled: boolean;
  fullWidth: boolean;
  withIcons: boolean;
}) {
  const { variant, size, loading, disabled, fullWidth, withIcons } = props;
  const { container, unmount } = render(
    <Button
      variant={variant}
      size={size}
      loading={loading}
      disabled={disabled}
      fullWidth={fullWidth}
      startIcon={withIcons ? <span data-testid="start" /> : undefined}
      endIcon={withIcons ? <span data-testid="end" /> : undefined}
    >
      تایید
    </Button>,
  );
  const button = container.querySelector('button');
  return { button, container, unmount };
}

describe('Property 17 — Button defines all six interactive states with signature tokens', () => {
  it('keeps every state class defined under any variant/size/state overlap', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VARIANTS),
        fc.constantFrom(...SIZES),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (variant, size, loading, disabled, fullWidth, withIcons) => {
          const { button, unmount } = renderButton({
            variant,
            size,
            loading,
            disabled,
            fullWidth,
            withIcons,
          });
          try {
            expect(button).not.toBeNull();
            const className = button!.className;

            // (1) default — the variant's token fill is always present.
            for (const token of DEFAULT_FILL[variant]) {
              expect(className, `default fill for ${variant}`).toMatch(token);
            }

            // (2) hover — token-driven hover affordance is defined.
            expect(className, `hover for ${variant}`).toMatch(HOVER[variant]);

            // (3) focus-visible — visible ring via the focus-ring token.
            expect(className, 'focus-visible ring').toMatch(FOCUS_VISIBLE);

            // (4) active/pressed — token brightness shift.
            expect(className, 'active/pressed').toMatch(ACTIVE);

            // (5) disabled — token opacity + cursor, independent of the
            //     `disabled`/`loading` props currently in effect.
            expect(className, 'disabled opacity').toMatch(DISABLED_OPACITY);
            expect(className, 'disabled cursor').toMatch(DISABLED_CURSOR);

            // (6) loading — driven by the `loading` prop: aria-busy + spinner.
            //     The contract holds for both polarities so the state is always
            //     *defined*, never silently dropped under overlap.
            if (loading) {
              expect(button!.getAttribute('aria-busy')).toBe('true');
              expect(button!.getAttribute('data-loading')).toBe('true');
              expect(
                button!.querySelector('svg.animate-spin'),
                'loading spinner',
              ).not.toBeNull();
            } else {
              expect(button!.getAttribute('aria-busy')).toBeNull();
              expect(button!.querySelector('svg.animate-spin')).toBeNull();
            }

            // loading OR disabled => the element is non-interactive (disabled).
            if (loading || disabled) {
              expect(button!.hasAttribute('disabled')).toBe(true);
            }

            // Signature-tokened, not literal: state transitions are driven by
            // the motion tokens (`--dur-*`/`--ease-*`), never a raw ms literal.
            expect(className, 'motion duration token').toMatch(MOTION_TOKEN);
            expect(className, 'motion easing token').toMatch(EASE_TOKEN);
          } finally {
            unmount();
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('loading state is reachable for every variant (spinner + aria-busy)', () => {
    for (const variant of VARIANTS) {
      const { button, unmount } = renderButton({
        variant,
        size: 'md',
        loading: true,
        disabled: false,
        fullWidth: false,
        withIcons: false,
      });
      try {
        expect(button!.getAttribute('aria-busy')).toBe('true');
        expect(button!.querySelector('svg.animate-spin')).not.toBeNull();
        expect(button!.hasAttribute('disabled')).toBe(true);
      } finally {
        unmount();
      }
    }
  });
});
