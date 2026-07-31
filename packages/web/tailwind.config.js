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

/**
 * Token color with real alpha-utility support.
 *
 * Tailwind cannot derive `bg-success/10` from a plain `var(--color-success)`
 * string (it needs channels to inject an alpha into), so every opacity-modified
 * token utility used to compile to NOTHING. This helper keeps `tokens.css` as
 * the single source of truth (no duplicated RGB triplets, and runtime overrides
 * like the funnel tenant accent keep working) by resolving the modifier through
 * `color-mix()`:
 *
 *  - `bg-success`     → `color-mix(in srgb, var(--color-success) calc(var(--tw-bg-opacity) * 100%), transparent)`
 *  - `bg-success/10`  → `color-mix(in srgb, var(--color-success) calc(0.1 * 100%), transparent)`
 *  - gradient stops (`from-bg/80`) receive the literal alpha the same way.
 *
 * `color-mix` toward `transparent` in sRGB is exactly `rgb(color / alpha)`.
 */
const withAlpha = (variable) => ({ opacityValue }) => {
  if (opacityValue === undefined) return `var(${variable})`;
  return `color-mix(in srgb, var(${variable}) calc(${opacityValue} * 100%), transparent)`;
};

export default {
  // Dark mode is driven by the `data-theme="dark"` attribute the ThemeProvider
  // sets on <html>, matching the steering theming hook.
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: withAlpha('--color-bg'),
        surface: withAlpha('--color-surface'),
        elevated: withAlpha('--color-elevated'),
        text: withAlpha('--color-text'),
        muted: withAlpha('--color-text-muted'),
        border: withAlpha('--color-border'),
        primary: {
          DEFAULT: withAlpha('--color-primary'),
          contrast: withAlpha('--color-primary-contrast'),
        },
        secondary: withAlpha('--color-secondary'),
        accent: withAlpha('--color-accent'),
        success: withAlpha('--color-success'),
        warning: withAlpha('--color-warning'),
        danger: withAlpha('--color-danger'),
        info: withAlpha('--color-info'),
        focus: withAlpha('--color-focus-ring'),
        // Deliberately-dark band roles (footer, stats band, dark hero chrome):
        // dark in BOTH themes. `ink-contrast`/`ink-muted` are on-ink text.
        ink: {
          DEFAULT: withAlpha('--color-ink'),
          contrast: withAlpha('--color-ink-contrast'),
          muted: withAlpha('--color-ink-muted'),
          border: withAlpha('--color-ink-border'),
        },
        // Modal/photo scrim (already carries its alpha in the token).
        overlay: 'var(--color-overlay)',
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
        '3xl': ['var(--font-3xl)', { lineHeight: 'var(--line-height-hero)' }],
        '4xl': ['var(--font-4xl)', { lineHeight: 'var(--line-height-hero)' }],
        '5xl': ['var(--font-5xl)', { lineHeight: 'var(--line-height-hero)' }],
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
        hero: 'var(--line-height-hero)',
      },
      letterSpacing: {
        display: 'var(--tracking-display)',
        tight: 'var(--tracking-tight)',
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
        glow: 'var(--shadow-glow)',
      },
      transitionDuration: {
        fast: 'var(--dur-fast)',
        base: 'var(--dur-base)',
        slow: 'var(--dur-slow)',
        enter: 'var(--dur-enter)',
        exit: 'var(--dur-exit)',
        stagger: 'var(--dur-stagger)',
        celebration: 'var(--dur-celebration)',
      },
      transitionTimingFunction: {
        standard: 'var(--ease-standard)',
        emphasized: 'var(--ease-emphasized)',
        spring: 'var(--ease-spring)',
        decelerate: 'var(--ease-decelerate)',
        ambient: 'var(--ease-ambient)',
      },
      // Motion library — the signature micro-interactions that make the PWA
      // feel alive. Every keyframe animates ONLY compositor-friendly properties
      // (`opacity` + `transform`) — never a reflow-triggering box property
      // (R6.2) — and every duration/easing resolves to a motion token
      // (`--dur-fast/base/slow`, `--ease-standard/emphasized`), so no raw
      // ms/easing literal is authored (R6.1). All animations are gated by the
      // global `prefers-reduced-motion: reduce` block in `tokens.css` (which
      // clamps them to 0.01ms) and most are applied via `motion-safe:` so they
      // play only when the visitor allows motion.
      keyframes: {
        // Booking-success moment (reserved for `BookingSuccessPage`).
        'success-pop': {
          '0%': { opacity: '0', transform: 'scale(0.85)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        // Soft entrance from below — page sections, cards, list items.
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        // Pure opacity entrance — overlays, toasts, route transitions.
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        // Scale-in for popovers, sheets, dialogs, badges.
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        // Inline-end slide for side drawers / sheets.
        'slide-in-end': {
          '0%': { opacity: '0', transform: 'translateX(12px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        // Skeleton shimmer — a diagonal gloss sweeps across the placeholder so
        // loading surfaces read as "alive" rather than static gray blocks.
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        // Toast slide-up from the bottom edge.
        'toast-in': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        // Press feedback — a quick scale-down pulse for tap targets.
        'tap-pulse': {
          '0%': { transform: 'scale(1)' },
          '40%': { transform: 'scale(0.97)' },
          '100%': { transform: 'scale(1)' },
        },
        // Exit counterparts — Radix keeps `data-[state=closed]` mounted while a
        // CSS animation runs, so overlays get a graceful opacity-led exit.
        'fade-out': {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        'scale-out': {
          '0%': { opacity: '1', transform: 'scale(1)' },
          '100%': { opacity: '0', transform: 'scale(0.97)' },
        },
        'toast-out': {
          '0%': { opacity: '1', transform: 'translateY(0)' },
          '100%': { opacity: '0', transform: 'translateY(8px)' },
        },
        // Ken Burns — a very gentle ambient zoom for editorial photography so
        // every hero/feature image drifts instead of sitting dead-still.
        // Transform only (compositor-friendly, no reflow) and direction-neutral:
        // a pure uniform `scale`, so it needs no RTL sign flip.
        //
        // Amplitude is deliberately SMALL and paired with a long duration below.
        // A wide zoom range forces the browser to resample the source on every
        // frame, which reads as shimmer/judder — especially on video, where each
        // decoded frame is rescaled. Small range + long duration keeps the
        // per-frame delta far below the eye's motion threshold, so it reads as a
        // calm drift rather than a shake.
        'ken-burns': {
          '0%': { transform: 'scale(1)' },
          '100%': { transform: 'scale(1.06)' },
        },
        // The full-bleed hero video/poster: a slightly wider frame gets a
        // slightly wider range, still well inside the "calm" band.
        'ken-burns-hero': {
          '0%': { transform: 'scale(1.01)' },
          '100%': { transform: 'scale(1.08)' },
        },
        // Hero photo slideshow: one keyframe track drives BOTH the cross-fade
        // and the Ken Burns drift for a single slide, so they can never drift
        // out of sync. Percentages assume three slides sharing one 21s cycle,
        // i.e. each slide owns a third of it (7s):
        //
        //   0%    → 7.14%   fade in (1.5s, overlaps the previous slide's fade out)
        //   7.14% → 33.33%  fully visible for 5.5s, drifting 1.00 → 1.04
        //   33.33%→ 40.47%  fade out, scale HELD at 1.04
        //   40.5%           scale reset — happens at opacity 0, so unseen
        //   40.5% → 100%    parked, waiting for its next turn
        //
        // Slides are offset by exactly a third of the cycle via
        // `animation-delay`, so the fade-out of one lands on the fade-in of the
        // next and the wrap-around at 100% is seamless.
        'hero-slide': {
          '0%': { opacity: '0', transform: 'scale(1)' },
          '7.14%': { opacity: '1' },
          '33.33%': { opacity: '1', transform: 'scale(1.04)' },
          '40.47%': { opacity: '0', transform: 'scale(1.04)' },
          '40.5%': { transform: 'scale(1)' },
          '100%': { opacity: '0', transform: 'scale(1)' },
        },
      },
      animation: {
        'success-pop': 'success-pop var(--dur-slow) var(--ease-emphasized) both',
        'fade-up': 'fade-up var(--dur-base) var(--ease-standard) both',
        'fade-in': 'fade-in var(--dur-base) var(--ease-standard) both',
        'scale-in': 'scale-in var(--dur-fast) var(--ease-emphasized) both',
        'slide-in-end': 'slide-in-end var(--dur-base) var(--ease-standard) both',
        shimmer: 'shimmer 1.6s var(--ease-standard) infinite',
        'toast-in': 'toast-in var(--dur-base) var(--ease-emphasized) both',
        'tap-pulse': 'tap-pulse var(--dur-fast) var(--ease-standard)',
        'fade-out': 'fade-out var(--dur-exit) var(--ease-standard) both',
        'scale-out': 'scale-out var(--dur-exit) var(--ease-standard) both',
        'toast-out': 'toast-out var(--dur-exit) var(--ease-standard) both',
        // Ambient photo drift. Very long + `alternate infinite` so the loop
        // never cuts/snaps, and NO `both` fill — under the global
        // `prefers-reduced-motion: reduce` clamp (tokens.css) the animation ends
        // immediately and the image settles back at its natural scale.
        //
        // The duration is the other half of the "gentle, not shaky" tuning: 6%
        // spread over 40s is ~0.15% scale per second, which the eye reads as
        // stillness that slowly opens up. Shorter cycles at the same amplitude
        // are what make a video judder.
        // IMPORTANT — the phase offsets live INSIDE these shorthands on purpose.
        // Pairing `animate-*` with a separate `[animation-delay:…]` utility is a
        // trap: the `animation` shorthand resets every sub-property it omits, so
        // whichever rule Tailwind emits LAST wins. `motion-safe:` variants are
        // emitted after plain utilities, so the shorthand silently clobbered the
        // delay and every phased element ran in lockstep. One class per phase
        // removes the ordering dependency entirely.
        'ken-burns': 'ken-burns 40s var(--ease-ambient) infinite alternate',
        'ken-burns-2': 'ken-burns 40s var(--ease-ambient) -10s infinite alternate',
        'ken-burns-3': 'ken-burns 40s var(--ease-ambient) -20s infinite alternate',
        'ken-burns-4': 'ken-burns 40s var(--ease-ambient) -30s infinite alternate',
        'ken-burns-hero': 'ken-burns-hero 50s var(--ease-ambient) infinite alternate',
        // 21s cycle ÷ 3 slides = 7s each: ~5.5s held, 1.5s cross-fade. Slide 1
        // is pulled back by the fade length so it opens at full opacity.
        'hero-slide-1': 'hero-slide 21s var(--ease-ambient) -1.5s infinite',
        'hero-slide-2': 'hero-slide 21s var(--ease-ambient) 5.5s infinite',
        'hero-slide-3': 'hero-slide 21s var(--ease-ambient) 12.5s infinite',
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
    plugin(({ addComponents, addUtilities }) => {
      addComponents({
        '.text-display': {
          fontWeight: 'var(--font-weight-display)',
          lineHeight: 'var(--line-height-display)',
          letterSpacing: 'var(--tracking-display)',
        },
      });
      // `.shimmer-bg` — the gradient + mask the `animate-shimmer` keyframe
      // sweeps across. Applied to `Skeleton` (see `components/ui/Skeleton.tsx`).
      // The gloss color is the theme-tuned `--shimmer-gloss` token so the sweep
      // stays visible over the light-mode `--color-border` fill too.
      addUtilities({
        '.shimmer-bg': {
          backgroundImage:
            'linear-gradient(90deg, transparent 0%, var(--shimmer-gloss) 50%, transparent 100%)',
          backgroundSize: '200% 100%',
          backgroundRepeat: 'no-repeat',
        },
      });
    }),
  ],
};
