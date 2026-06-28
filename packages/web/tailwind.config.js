/** @type {import('tailwindcss').Config} */
// Tailwind CSS v3 configuration for the Salon Booking PWA.
//
// All design values map onto CSS custom properties (declared in the global
// token stylesheet on `:root` and `[data-theme="dark"]`) so components consume
// tokens only — never raw hex/px/ms literals. See `.kiro/steering/ui-ux-skills.md`.
//
// RTL-first: rely on Tailwind's built-in logical-property utilities
// (`ms-*`/`me-*`, `ps-*`/`pe-*`, `start-*`/`end-*`, `text-start`/`text-end`)
// which flip automatically under `dir="rtl"`. Add `tailwindcss-logical` only if
// a gap appears — none required so far.
import plugin from 'tailwindcss/plugin';

export default {
  // Dark mode is driven by the `data-theme="dark"` attribute the ThemeProvider
  // sets on <html>, matching the steering theming hook.
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        elevated: 'var(--color-elevated)',
        text: 'var(--color-text)',
        muted: 'var(--color-text-muted)',
        border: 'var(--color-border)',
        primary: {
          DEFAULT: 'var(--color-primary)',
          contrast: 'var(--color-primary-contrast)',
        },
        secondary: 'var(--color-secondary)',
        accent: 'var(--color-accent)',
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        danger: 'var(--color-danger)',
        info: 'var(--color-info)',
        focus: 'var(--color-focus-ring)',
      },
      spacing: {
        0: 'var(--space-0)',
        1: 'var(--space-1)',
        2: 'var(--space-2)',
        3: 'var(--space-3)',
        4: 'var(--space-4)',
        5: 'var(--space-5)',
        6: 'var(--space-6)',
        8: 'var(--space-8)',
        10: 'var(--space-10)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        pill: 'var(--radius-pill)',
      },
      fontSize: {
        '2xs': ['var(--font-2xs)', { lineHeight: '1.7' }],
        xs: ['var(--font-xs)', { lineHeight: '1.7' }],
        sm: ['var(--font-sm)', { lineHeight: '1.75' }],
        md: ['var(--font-md)', { lineHeight: '1.7' }],
        lg: ['var(--font-lg)', { lineHeight: '1.45' }],
        xl: ['var(--font-xl)', { lineHeight: '1.35' }],
        '2xl': ['var(--font-2xl)', { lineHeight: '1.25' }],
      },
      fontFamily: {
        sans: ["'Vazirmatn'", 'system-ui', "'Segoe UI'", 'Tahoma', 'sans-serif'],
      },
      // Signature display-type pairing tokens (design §2, R1.2/R8.1). Exposed as
      // atomic utilities (`font-body`/`font-display`, `leading-display`,
      // `tracking-display`) and composed into the `.text-display` treatment
      // below. Values resolve to the `--font-weight-*` / `--line-height-display`
      // / `--tracking-display` custom properties so they re-tint with the theme
      // and never hard-code a literal.
      fontWeight: {
        body: 'var(--font-weight-body)',
        display: 'var(--font-weight-display)',
      },
      lineHeight: {
        display: 'var(--line-height-display)',
      },
      letterSpacing: {
        display: 'var(--tracking-display)',
      },
      maxWidth: {
        // Content container width (steering §5: content max ≈ 1200px).
        container: '1200px',
        // Booking funnel card width (steering §5: funnel card max ≈ 480px).
        funnel: '480px',
        // Reading column measure (steering §4: 45–75 chars).
        prose: '70ch',
      },
      zIndex: {
        base: '0',
        sticky: '100',
        nav: '200',
        overlay: '1000',
        dialog: '1100',
        toast: '1200',
      },
      boxShadow: {
        1: 'var(--shadow-1)',
        2: 'var(--shadow-2)',
        3: 'var(--shadow-3)',
      },
      transitionDuration: {
        fast: 'var(--dur-fast)',
        base: 'var(--dur-base)',
        slow: 'var(--dur-slow)',
      },
      transitionTimingFunction: {
        standard: 'var(--ease-standard)',
        emphasized: 'var(--ease-emphasized)',
      },
      // Signature success micro-interaction (design §motion, R6.4/R6.5). The
      // one keyframe that uses the emphasized easing token — reserved for the
      // booking-success moment (`BookingSuccessPage`). It animates only
      // compositor-friendly properties (`opacity` + `transform: scale`, never a
      // reflow-triggering box property, R6.2) and drives its duration/easing
      // from the motion tokens (`--dur-slow` = 300ms, within the 150–300ms band;
      // `--ease-emphasized`), so no raw ms/easing literal is authored (R6.1).
      // Applied via `motion-safe:` so it plays only when motion is allowed; the
      // authoritative `prefers-reduced-motion` block in `tokens.css` governs the
      // reduced-motion case (no transform, never gates content).
      keyframes: {
        'success-pop': {
          '0%': { opacity: '0', transform: 'scale(0.85)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'success-pop': 'success-pop var(--dur-slow) var(--ease-emphasized) both',
      },
    },
  },
  plugins: [
    // `.text-display` — the one-shot signature display treatment for hero and
    // section titles (design §2). Composes the heavier display weight, the
    // tighter display line-height, and the editorial tracking from tokens so a
    // title is visibly distinct from body copy. Registered in the components
    // layer so an explicit size utility (e.g. `text-2xl`) still sets the size;
    // pair with `leading-display` when a size utility's own line-height must be
    // overridden.
    plugin(({ addComponents }) => {
      addComponents({
        '.text-display': {
          fontWeight: 'var(--font-weight-display)',
          lineHeight: 'var(--line-height-display)',
          letterSpacing: 'var(--tracking-display)',
        },
      });
    }),
  ],
};
