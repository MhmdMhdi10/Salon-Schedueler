import { useEffect } from 'react';

/**
 * Per-salon (and per-stylist) PWA install.
 *
 * When a customer lands from a scanned QR, we want "add to home screen" to save
 * an icon **named after that salon/stylist** whose `start_url` deep-links
 * straight back into that salon's booking funnel — so re-booking is one tap.
 *
 * The app is a client-rendered SPA with a single static `/manifest.json`, so we
 * build a per-salon manifest **at runtime** as a Blob and repoint the document's
 * `<link rel="manifest">` at it; on cleanup we restore the original. We also set
 * the iOS-only `<meta name="apple-mobile-web-app-title">` because iOS Safari
 * ignores the web manifest's `name` for the home-screen label and uses that meta
 * (or the document title) instead.
 *
 * Honest platform caveats:
 *  - Chromium honors a dynamic (blob) manifest for the install prompt + name.
 *  - iOS Safari has **no** programmatic install; the user adds via Share → "Add
 *    to Home Screen". We name that icon via `apple-mobile-web-app-title` and set
 *    `apple-mobile-web-app-capable` so it launches standalone.
 *  - Icons stay the shared app icons (we have no per-salon artwork); the name is
 *    what differentiates each saved salon.
 */

/**
 * Signature default PWA `theme_color` — the salon-luxe `--color-primary`
 * (`tokens.css` `:root`). Used when no per-salon accent color is supplied. The
 * old hard-coded indigo `#6366f1` is gone (signature-ui-system R4.6).
 */
const SIGNATURE_THEME_COLOR = '#D81B60';

/** Shared, static fields mirrored from `public/manifest.json`. */
const SHARED_MANIFEST = {
  description: 'رزرو آنلاین نوبت سالن زیبایی',
  display: 'standalone' as const,
  orientation: 'portrait' as const,
  dir: 'rtl' as const,
  lang: 'fa' as const,
  background_color: '#ffffff',
  theme_color: SIGNATURE_THEME_COLOR,
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    {
      src: '/icons/icon-512-maskable.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ],
};

export interface SalonManifestOptions {
  /** Home-screen / install name (e.g. the salon, or "salon — stylist"). */
  name: string;
  /** Short label for the launcher (kept terse; falls back to `name`). */
  shortName?: string;
  /** App-relative booking path the installed app opens at (e.g. `/salon/:id/book`). */
  startPath: string;
  /**
   * Per-salon PWA chrome color (signature-ui-system R4.6) — derived from the
   * salon's Brand_Accent (`ensureAaFill(accent.from)`). Falls back to the
   * signature `--color-primary` when absent.
   */
  themeColor?: string;
}

/** A no-op cleanup used on SSR / when nothing was applied. */
const NOOP = () => {};

/** True when we can safely create/revoke object URLs (guards jsdom/SSR). */
function canUseObjectUrls(): boolean {
  return (
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function' &&
    typeof URL.revokeObjectURL === 'function' &&
    typeof Blob !== 'undefined'
  );
}

/** Get (or create) a `<meta name>` element, returning it and its prior content. */
function upsertMeta(name: string, content: string): { el: HTMLMetaElement; prev: string | null; created: boolean } {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  const created = !el;
  const prev = el ? el.getAttribute('content') : null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
  return { el, prev, created };
}

/**
 * Repoint the page's manifest at a per-salon Blob manifest and set the iOS
 * home-screen title. Returns a cleanup that restores the previous state.
 *
 * URLs inside a Blob manifest must be absolute (they would otherwise resolve
 * against the `blob:` URL), so `start_url`, `scope`, and `id` are built from the
 * current origin.
 */
export function applySalonManifest(opts: SalonManifestOptions): () => void {
  if (typeof document === 'undefined') return NOOP;

  const cleanups: Array<() => void> = [];

  // iOS home-screen label + standalone launch (works regardless of the manifest).
  const appleTitle = upsertMeta('apple-mobile-web-app-title', opts.name);
  cleanups.push(() => {
    if (appleTitle.created) appleTitle.el.remove();
    else if (appleTitle.prev !== null) appleTitle.el.setAttribute('content', appleTitle.prev);
  });
  const appleCapable = upsertMeta('apple-mobile-web-app-capable', 'yes');
  cleanups.push(() => {
    if (appleCapable.created) appleCapable.el.remove();
    else if (appleCapable.prev !== null) appleCapable.el.setAttribute('content', appleCapable.prev);
  });

  // The dynamic manifest itself (Chromium honors this for the install prompt).
  const link = document.head.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (link && canUseObjectUrls()) {
    const origin = window.location.origin;
    const startUrl = new URL(opts.startPath, origin).toString();
    const manifest = {
      ...SHARED_MANIFEST,
      // Per-salon accent-derived chrome color, else the signature default (R4.6).
      theme_color: opts.themeColor ?? SHARED_MANIFEST.theme_color,
      id: startUrl,
      name: opts.name,
      short_name: (opts.shortName ?? opts.name).slice(0, 30),
      start_url: startUrl,
      scope: `${origin}/`,
    };
    let blobUrl = '';
    try {
      const blob = new Blob([JSON.stringify(manifest)], {
        type: 'application/manifest+json',
      });
      blobUrl = URL.createObjectURL(blob);
      const prevHref = link.getAttribute('href');
      link.setAttribute('href', blobUrl);
      cleanups.push(() => {
        // Restore the original manifest href BEFORE revoking the blob.
        if (prevHref !== null) link.setAttribute('href', prevHref);
        URL.revokeObjectURL(blobUrl);
      });
    } catch {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    }
  }

  return () => {
    // Run cleanups in reverse so the manifest href is restored before its blob
    // is revoked, and metas return to their prior values.
    for (let i = cleanups.length - 1; i >= 0; i--) cleanups[i]();
  };
}

/**
 * React hook: while mounted with a non-empty `name`, brand the install/manifest
 * for this salon (or stylist). Re-applies when the identity, destination, or
 * accent color changes and restores the original manifest on unmount.
 */
export function useSalonManifest(
  name: string | undefined | null,
  startPath: string,
  shortName?: string,
  themeColor?: string,
): void {
  useEffect(() => {
    const trimmed = name?.trim();
    if (!trimmed || !startPath) return undefined;
    return applySalonManifest({
      name: trimmed,
      startPath,
      shortName: shortName?.trim(),
      themeColor,
    });
  }, [name, startPath, shortName, themeColor]);
}
