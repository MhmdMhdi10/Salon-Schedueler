import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';

/**
 * Motion stays within the token band and reserves emphasized easing —
 * signature-ui-system Property 18 (R6.4; ui-ux §2 motion, §9).
 *
 * `Feature: signature-ui-system, Property 18: Motion stays within the token band and reserves emphasized easing`
 *
 * Two source-of-truth guardrails, checked by scanning the authored web source
 * directly (the same approach as the distinctiveness guardrail) rather than a
 * runtime render — motion is authored as tokens/utilities, so the invariant is a
 * property of the source text:
 *
 *  1. **Duration band.** Every authored motion **duration token** in
 *     `tokens.css` (`--dur-fast`/`--dur-base`/`--dur-slow`) sits within the
 *     150–300ms band the design mandates (ui-ux §9 "Duration 150–300ms"). The
 *     reduced-motion override (`0.01ms !important`) is intentional and is NOT a
 *     `--dur-*` token, so it is excluded by construction.
 *  2. **Emphasized easing is reserved.** The emphasized easing
 *     (`--ease-emphasized` / the Tailwind `ease-emphasized` utility /
 *     `animate-success-pop`) is referenced ONLY on the booking-success surface
 *     (`pages/BookingSuccessPage.tsx`). The token/config DEFINITION files
 *     (`styles/tokens.css`, `tailwind.config.js`) legitimately declare it and are
 *     excluded; no other authored surface may consume it. This keeps the
 *     emphasized curve a one-off for the primary success moment (ui-ux §9
 *     "reserve emphasized easing for the primary success moment").
 *
 * Validates: Requirements 6.4
 */

const HERE = resolve(fileURLToPath(import.meta.url), '..'); // .../src/styles
const SRC_DIR = resolve(HERE, '..'); // .../src
const TOKENS_CSS = join(HERE, 'tokens.css');

/** The lower/upper bounds of the design's motion-duration band (ui-ux §9). */
const BAND_MIN_MS = 150;
const BAND_MAX_MS = 300;

/** The single surface allowed to consume the emphasized easing (R6.4). */
const SUCCESS_SURFACE = join('pages', 'BookingSuccessPage.tsx');

/**
 * Parse the `--dur-*: <n>ms` motion-duration tokens out of `tokens.css`. Only
 * matches `--dur-` custom properties, so the reduced-motion `0.01ms !important`
 * animation/transition overrides (which are not `--dur-*` tokens) are ignored.
 */
function parseDurationTokens(css: string): Array<{ name: string; ms: number }> {
  const tokens: Array<{ name: string; ms: number }> = [];
  const re = /(--dur-[\w-]+)\s*:\s*([\d.]+)ms/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    tokens.push({ name: m[1], ms: Number(m[2]) });
  }
  return tokens;
}

/** Recursively collect authored source files under `dir` (ts/tsx/css). */
function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectSourceFiles(full));
      continue;
    }
    if (!/\.(ts|tsx|css)$/.test(entry.name)) continue;
    // Exclude test files and the token DEFINITION stylesheet — they legitimately
    // reference the emphasized token (definition) or assert against it.
    if (/\.test\./.test(entry.name)) continue;
    if (entry.name === 'tokens.css') continue;
    out.push(full);
  }
  return out;
}

/** Patterns that signal a consumer of the reserved emphasized motion. */
const EMPHASIZED_PATTERNS = [/--ease-emphasized/, /\bease-emphasized\b/, /\banimate-success-pop\b/];

describe('Property 18 — motion stays within the token band', () => {
  const allTokens = parseDurationTokens(readFileSync(TOKENS_CSS, 'utf8'));

  /**
   * Animation/orchestration tokens are exempt from the 150–300ms interaction band.
   * These serve page transitions, stagger orchestration, and celebration sequences
   * (design §2 "Animation Tokens"), not micro-interactions.
   */
  const ANIMATION_TOKENS = new Set([
    '--dur-enter',
    '--dur-exit',
    '--dur-stagger',
    '--dur-celebration',
  ]);

  const interactionTokens = allTokens.filter((t) => !ANIMATION_TOKENS.has(t.name));
  const animationTokens = allTokens.filter((t) => ANIMATION_TOKENS.has(t.name));

  it('declares the expected --dur-* interaction motion tokens', () => {
    const names = interactionTokens.map((t) => t.name).sort();
    expect(names).toEqual(['--dur-base', '--dur-fast', '--dur-slow']);
  });

  it('declares the expected --dur-* animation tokens', () => {
    const names = animationTokens.map((t) => t.name).sort();
    expect(names).toEqual(['--dur-celebration', '--dur-enter', '--dur-exit', '--dur-stagger']);
  });

  it('every interaction duration token is within the 150–300ms band', () => {
    // fast-check: for ANY interaction duration token, the value lies in the band.
    fc.assert(
      fc.property(fc.constantFrom(...interactionTokens), (token) => {
        expect(token.ms).toBeGreaterThanOrEqual(BAND_MIN_MS);
        expect(token.ms).toBeLessThanOrEqual(BAND_MAX_MS);
      }),
    );
  });

  it('animation tokens have sensible values for their purpose', () => {
    const byName = Object.fromEntries(animationTokens.map((t) => [t.name, t.ms]));
    // Enter is slower than exit (asymmetric timing)
    expect(byName['--dur-enter']).toBeGreaterThan(byName['--dur-exit']);
    // Stagger is a short delay increment
    expect(byName['--dur-stagger']).toBeLessThanOrEqual(100);
    // Celebration is the longest animation
    expect(byName['--dur-celebration']).toBeGreaterThan(byName['--dur-enter']);
  });
});

describe('Property 18 — emphasized easing is reserved for booking-success', () => {
  const files = collectSourceFiles(SRC_DIR);

  it('finds authored source files to scan', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('only BookingSuccessPage.tsx references the emphasized motion', () => {
    const offenders = files
      .filter((file) => {
        const content = readFileSync(file, 'utf8');
        return EMPHASIZED_PATTERNS.some((re) => re.test(content));
      })
      .map((file) => relative(SRC_DIR, file).split(sep).join('/'));

    const allowed = SUCCESS_SURFACE.split(sep).join('/');
    expect(offenders).toEqual([allowed]);
  });
});
