import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import { applySalonManifest } from '../salonManifest';
import { ACCENTS, resolveAccent } from '../../pages/owner/marketing-assets';
import { ensureAaFill } from '../../styles/contrast';

/**
 * PWA install identity derives from the accent and scopes to the storefront —
 * signature-ui-system Property 9 (R4.6).
 *
 * `Feature: signature-ui-system, Property 9: PWA install identity derives from the accent and scopes to the storefront`
 *
 * `applySalonManifest` builds a per-salon blob manifest and repoints the
 * document's `<link rel="manifest">`. This suite captures that blob and asserts
 * that, for any salon with a Brand_Accent, the manifest `theme_color` is the
 * accent-derived AA-safe fill (not the old hard-coded indigo) and the
 * `start_url` is that salon's storefront booking path, scoped to the origin.
 *
 * Validates: Requirements 4.6
 */

/** The signature default theme color (Booksy_Identity --color-primary). */
const SIGNATURE_THEME_COLOR = '#0B7A68';

let lastManifestJson = '';
const RealBlob = globalThis.Blob;

beforeEach(() => {
  lastManifestJson = '';
  document.head.innerHTML = '<link rel="manifest" href="/manifest.json">';
  // Capture the manifest JSON the helper serializes (jsdom's Blob has no
  // reliable `.text()`), and provide object-URL methods jsdom omits.
  globalThis.Blob = class {
    type: string;
    constructor(parts: unknown[], opts?: { type?: string }) {
      lastManifestJson = (parts ?? []).map((p) => String(p)).join('');
      this.type = opts?.type ?? '';
    }
  } as unknown as typeof Blob;
  (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = () =>
    'blob:manifest-mock';
  (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = () => {};
});

afterEach(() => {
  globalThis.Blob = RealBlob;
  delete (URL as unknown as { createObjectURL?: unknown }).createObjectURL;
  delete (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL;
  vi.restoreAllMocks();
  document.head.innerHTML = '';
});

/** Read back the per-salon manifest JSON the helper serialized into the Blob. */
async function readManifest(): Promise<Record<string, unknown>> {
  expect(lastManifestJson).not.toBe('');
  return JSON.parse(lastManifestJson) as Record<string, unknown>;
}

describe('Feature: signature-ui-system, Property 9: PWA install identity derives from the accent and scopes to the storefront', () => {
  it('theme_color is the accent-derived fill and start_url is the salon storefront path', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...ACCENTS.map((a) => a.key)),
        fc
          .string({ minLength: 1, maxLength: 16 })
          .map((s) => s.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase())
          .filter((s) => s.length > 0),
        async (accentKey, salonId) => {
          document.head.innerHTML = '<link rel="manifest" href="/manifest.json">';
          lastManifestJson = '';
          const startPath = `/salon/${salonId}/book`;
          const themeColor = ensureAaFill(resolveAccent(accentKey).from);

          const cleanup = applySalonManifest({
            name: 'سالن',
            startPath,
            themeColor,
          });

          const manifest = await readManifest();
          // Accent-derived chrome color (not the removed indigo #6366f1).
          expect(manifest.theme_color).toBe(themeColor);
          expect(manifest.theme_color).not.toBe('#6366f1');
          // start_url is the salon's storefront booking path, scoped to origin.
          expect(String(manifest.start_url)).toMatch(
            new RegExp(`/salon/${salonId}/book$`),
          );
          expect(manifest.scope).toBe(`${window.location.origin}/`);

          cleanup();
        },
      ),
      { numRuns: 50 },
    );
  });

  it('falls back to the signature default theme color when no accent color is supplied', async () => {
    const cleanup = applySalonManifest({ name: 'سالن', startPath: '/salon/abc/book' });
    const manifest = await readManifest();
    expect(manifest.theme_color).toBe(SIGNATURE_THEME_COLOR);
    expect(manifest.theme_color).not.toBe('#6366f1');
    cleanup();
  });

  it('keeps start_url scoped to the storefront booking path', async () => {
    const cleanup = applySalonManifest({
      name: 'سالن رز',
      startPath: '/salon/salon-1/book',
      themeColor: ensureAaFill(resolveAccent('rose').from),
    });
    const manifest = await readManifest();
    expect(String(manifest.start_url).endsWith('/salon/salon-1/book')).toBe(true);
    cleanup();
  });
});
