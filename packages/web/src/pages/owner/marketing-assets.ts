/**
 * Custom-branded marketing assets for the owner panel «QR و استند» studio.
 *
 * The salon's stable QR (from `qrApi.getSalonQr`) is dropped into three
 * print-ready, per-salon-branded layouts — a counter **card**, a wall **banner**
 * (poster), and a simple **standee** — each tinted with a chosen brand accent.
 * The layouts themselves are HTML/CSS (so Persian renders with the app's
 * Vazirmatn font and prints crisply via `@media print`); this module supplies
 * the accent themes and the client-side download helpers (QR as SVG/PNG).
 *
 * Nothing here pulls a new dependency: the QR image reuses the dependency-free
 * `./qr-svg` generator, kept inside the lazily-loaded owner chunk.
 */
import type { CSSProperties } from 'react';
import { buildQrSvg } from './qr-svg';

/** The three printable layouts offered in the studio. */
export type AssetKind = 'card' | 'banner' | 'standee';
export const ASSET_KINDS: readonly AssetKind[] = ['card', 'banner', 'standee'] as const;

/** A brand-accent theme: the gradient pair + soft tint + dark ink. */
export interface AccentTheme {
  key: string;
  from: string;
  to: string;
  soft: string;
  ink: string;
}

/**
 * Curated accent palette (gradient from→to). Values are chosen so white text
 * sits comfortably on the gradient and the QR panel stays high-contrast.
 */
export const ACCENTS: readonly AccentTheme[] = [
  { key: 'violet', from: '#6d5efc', to: '#a855f7', soft: '#efeafe', ink: '#2e1065' },
  { key: 'magenta', from: '#ec4899', to: '#8b5cf6', soft: '#fdeaf5', ink: '#500724' },
  { key: 'teal', from: '#0ea5a4', to: '#0284c7', soft: '#e2fbfb', ink: '#083344' },
  { key: 'rose', from: '#fb7185', to: '#ef4444', soft: '#ffe9ec', ink: '#4c0519' },
  { key: 'amber', from: '#f59e0b', to: '#ea580c', soft: '#fdf0d5', ink: '#451a03' },
  { key: 'emerald', from: '#10b981', to: '#047857', soft: '#dcfbee', ink: '#022c22' },
  { key: 'night', from: '#3b4252', to: '#4f46e5', soft: '#e6e8f0', ink: '#0b1020' },
] as const;

/** Resolve an accent by key, falling back to the first (violet). */
export function resolveAccent(key: string): AccentTheme {
  return ACCENTS.find((a) => a.key === key) ?? ACCENTS[0];
}

/**
 * Inline CSS custom properties an asset reads for its brand colors. Cast to
 * CSSProperties since CSS variables are not in the typed property map.
 */
export function accentVars(a: AccentTheme): CSSProperties {
  return {
    '--asset-from': a.from,
    '--asset-to': a.to,
    '--asset-soft': a.soft,
    '--asset-ink': a.ink,
  } as CSSProperties;
}

/** Build a `data:` URI for the QR (an SVG image) suitable for an `<img src>`. */
export function qrImageDataUri(payload: string, title: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(buildQrSvg(payload, title))}`;
}

/** A safe, ASCII filename stem derived from a salon name (for downloads). */
export function fileStem(salonName: string): string {
  const ascii = salonName
    .normalize('NFKD')
    .replace(/[^\w\u0600-\u06FF-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return ascii.length > 0 ? ascii : 'salon';
}

/** Trigger a browser download for an object/blob URL, then clean up the anchor. */
function clickDownload(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Download arbitrary text (e.g. the QR SVG markup) as a file. */
export function downloadText(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  clickDownload(url, filename);
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Download the QR as a standalone vector SVG file. */
export function downloadQrSvg(payload: string, title: string, salonName: string): void {
  downloadText(buildQrSvg(payload, title), `qr-${fileStem(salonName)}.svg`, 'image/svg+xml');
}

/**
 * Rasterize the QR SVG to a high-resolution PNG and download it. Uses an
 * in-memory `<img>` → `<canvas>` pipeline; the SVG is a self-contained data URI
 * (white background already baked in) so the canvas never taints.
 */
export async function downloadQrPng(
  payload: string,
  title: string,
  salonName: string,
  size = 1024,
): Promise<void> {
  const svg = buildQrSvg(payload, title);
  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const pngUrl = await new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('canvas unsupported'));
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('rasterize failed'));
          return;
        }
        resolve(URL.createObjectURL(blob));
      }, 'image/png');
    };
    img.onerror = () => reject(new Error('image load failed'));
    img.src = svgUrl;
  });
  clickDownload(pngUrl, `qr-${fileStem(salonName)}.png`);
  window.setTimeout(() => URL.revokeObjectURL(pngUrl), 2000);
}
