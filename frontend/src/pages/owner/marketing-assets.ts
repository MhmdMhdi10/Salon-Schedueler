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
import { buildQrSvg, encodeQrToSvgPath } from './qr-svg';
import type { AccentTheme } from '../../components/theme/accents';

/** The three printable layouts offered in the studio. */
export type AssetKind = 'card' | 'banner' | 'standee';
export const ASSET_KINDS: readonly AssetKind[] = ['card', 'banner', 'standee'] as const;

/** Values needed to export the same salon-branded artwork shown in the studio. */
export interface AssetDownloadOptions {
  kind: AssetKind;
  salonName: string;
  tagline: string;
  cta: string;
  payload: string;
  accent: AccentTheme;
  logoDataUri?: string;
  showBrand: boolean;
  footer?: string;
}

// The accent palette lives in `components/theme/accents` so public storefront
// surfaces (TenantTheme, QR landing) can use it without pulling this module's
// QR generator + download helpers into their bundles. Re-exported here so
// existing owner-studio imports keep working.
export { ACCENTS, resolveAccent, accentVars } from '../../components/theme/accents';
export type { AccentTheme } from '../../components/theme/accents';

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

function escapeXml(value: string): string {
  return value.replace(/[<>&'\"]/g, (character) => {
    const entities: Record<string, string> = {
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      "'": '&apos;',
      '"': '&quot;',
    };
    return entities[character] ?? character;
  });
}

function textValue(value: string, maxLength: number): string {
  return escapeXml(value.replace(/\s+/g, ' ').trim().slice(0, maxLength));
}

function qrFragment(payload: string, x: number, y: number, size: number): string {
  const { size: moduleSize, path } = encodeQrToSvgPath(payload);
  const quietZone = 4;
  const qrSize = moduleSize + quietZone * 2;
  const padding = Math.round(size * 0.08);
  const scale = (size - padding * 2) / qrSize;
  return [
    `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="28" fill="#ffffff"/>`,
    `<g transform="translate(${x + padding} ${y + padding}) scale(${scale})">`,
    `<path transform="translate(${quietZone} ${quietZone})" d="${path}" fill="#000000"/>`,
    '</g>',
  ].join('');
}

function brandFragment(showBrand: boolean, x: number, y: number, ink: string): string {
  if (!showBrand) return '';
  return [
    `<g transform="translate(${x} ${y})">`,
    `<rect width="150" height="52" rx="26" fill="#ffffff" fill-opacity="0.94"/>`,
    `<text x="75" y="34" text-anchor="middle" fill="${ink}" font-size="26" font-weight="700">آرا</text>`,
    '</g>',
  ].join('');
}

function logoFragment(logoDataUri: string | undefined, x: number, y: number): string {
  if (!logoDataUri) return '';
  return `<image x="${x}" y="${y}" width="220" height="100" href="${escapeXml(logoDataUri)}" preserveAspectRatio="xMinYMid meet"/>`;
}

/** Build a self-contained SVG picture of the selected branded asset. */
export function buildAssetSvg(options: AssetDownloadOptions): string {
  const width = options.kind === 'card' ? 1600 : 1000;
  const height = options.kind === 'card' ? 1035 : options.kind === 'banner' ? 1414 : 1300;
  const radius = options.kind === 'card' ? 56 : 44;
  const gradientId = 'asset-gradient';
  const name = textValue(options.salonName, 42);
  const tagline = textValue(options.tagline, 72);
  const cta = textValue(options.cta, 52);
  const footer = textValue(options.footer ?? '۲۴ ساعته • بدون تماس • آنلاین', 52);
  const qr =
    options.kind === 'card'
      ? qrFragment(options.payload, 1120, 220, 360)
      : qrFragment(
          options.payload,
          300,
          options.kind === 'banner' ? 390 : 320,
          options.kind === 'banner' ? 400 : 360,
        );
  const sharedDefs = [
    '<defs>',
    `<linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="1">`,
    `<stop offset="0" stop-color="${escapeXml(options.accent.from)}"/>`,
    `<stop offset="1" stop-color="${escapeXml(options.accent.to)}"/>`,
    '</linearGradient>',
    '</defs>',
  ].join('');
  const background = [
    `<rect width="${width}" height="${height}" rx="${radius}" fill="url(#${gradientId})"/>`,
    `<circle cx="${Math.round(width * 0.9)}" cy="${Math.round(height * 0.08)}" r="${Math.round(width * 0.22)}" fill="#ffffff" fill-opacity="0.13"/>`,
    `<circle cx="${Math.round(width * 0.08)}" cy="${Math.round(height * 0.96)}" r="${Math.round(width * 0.2)}" fill="#000000" fill-opacity="0.12"/>`,
  ].join('');
  const brand = brandFragment(
    options.showBrand,
    options.kind === 'card' ? 100 : 350,
    82,
    options.accent.ink,
  );
  const logo = logoFragment(options.logoDataUri, options.kind === 'card' ? 100 : 350, 148);

  let content = '';
  if (options.kind === 'card') {
    content = [
      brand,
      logo,
      `<text x="100" y="430" fill="#ffffff" font-size="76" font-weight="700" direction="rtl" unicode-bidi="plaintext">${name}</text>`,
      `<text x="100" y="515" fill="#ffffff" fill-opacity="0.92" font-size="34" direction="rtl" unicode-bidi="plaintext">${tagline}</text>`,
      `<text x="100" y="900" fill="#ffffff" fill-opacity="0.9" font-size="28" font-weight="600" direction="rtl" unicode-bidi="plaintext">${footer}</text>`,
      qr,
      `<text x="1300" y="650" fill="#ffffff" font-size="28" font-weight="700" text-anchor="middle" direction="rtl" unicode-bidi="plaintext">${cta}</text>`,
    ].join('');
  } else if (options.kind === 'banner') {
    content = [
      brand,
      logo,
      `<text x="500" y="300" fill="#ffffff" font-size="56" font-weight="700" text-anchor="middle" direction="rtl" unicode-bidi="plaintext">${name}</text>`,
      `<text x="500" y="355" fill="#ffffff" fill-opacity="0.92" font-size="32" text-anchor="middle" direction="rtl" unicode-bidi="plaintext">${tagline}</text>`,
      `<text x="500" y="1120" fill="#ffffff" font-size="48" font-weight="700" text-anchor="middle" direction="rtl" unicode-bidi="plaintext">${cta}</text>`,
      qr,
    ].join('');
  } else {
    content = [
      brand,
      logo,
      `<text x="500" y="220" fill="#111827" font-size="64" font-weight="700" text-anchor="middle" direction="rtl" unicode-bidi="plaintext">${name}</text>`,
      `<text x="500" y="270" fill="#111827" fill-opacity="0.86" font-size="32" text-anchor="middle" direction="rtl" unicode-bidi="plaintext">${tagline}</text>`,
      `<text x="500" y="850" fill="#111827" font-size="44" font-weight="700" text-anchor="middle" direction="rtl" unicode-bidi="plaintext">${cta}</text>`,
      qr,
    ].join('');
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">`,
    `<title>${name}</title>`,
    sharedDefs,
    background,
    content,
    '</svg>',
  ].join('');
}

function rasterizeSvgToPng(svg: string, width: number, height: number): Promise<string> {
  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('canvas unsupported'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
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
  const pngUrl = await rasterizeSvgToPng(svg, size, size);
  clickDownload(pngUrl, `qr-${fileStem(salonName)}.png`);
  window.setTimeout(() => URL.revokeObjectURL(pngUrl), 2000);
}

/** Download the complete branded card, banner, or standee as a PNG picture. */
export async function downloadAssetPng(options: AssetDownloadOptions): Promise<void> {
  const width = options.kind === 'card' ? 1600 : 1000;
  const height = options.kind === 'card' ? 1035 : options.kind === 'banner' ? 1414 : 1300;
  const pngUrl = await rasterizeSvgToPng(buildAssetSvg(options), width, height);
  clickDownload(pngUrl, `${fileStem(options.salonName)}-${options.kind}.png`);
  window.setTimeout(() => URL.revokeObjectURL(pngUrl), 2000);
}
