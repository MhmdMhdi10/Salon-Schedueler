/**
 * Generates the PWA raster assets referenced by `public/manifest.json`
 * (task 4.5; R11.1, R11.2): the 192/512 "any" icons, the 512×512 maskable
 * icon, and the install screenshots. These are brand-indigo placeholder
 * bitmaps authored as valid PNGs so the manifest resolves (no 404s) and the
 * app is installable; replace with final artwork when available.
 *
 * It also emits modern, compressed **AVIF** and **WebP** variants of the
 * content images (the marketing hero at both responsive widths and the default
 * gallery/OG image) so the pages can serve them via `<picture>` with a PNG/JPG
 * fallback (task 11.2; R9.5, R9.6; ui-ux §12; seo §9). The PWA icons and
 * screenshots are intentionally left PNG-only — they are install-UI chrome, not
 * page content, and the manifest references the PNGs directly.
 *
 * The base bitmaps are authored with pure Node + zlib (no image deps); the
 * AVIF/WebP variants are encoded with `sharp`. Run:
 * `node scripts/generate-pwa-assets.mjs`.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(HERE, '../public');

const BRAND = [0x63, 0x66, 0xf1]; // #6366f1
const MASKABLE_BG = [0x54, 0x57, 0xe6]; // #5457e6 (full-bleed safe zone)

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** Builds a solid-color RGB PNG of the given size. */
function solidPng(width, height, [r, g, b]) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const rowLen = width * 3;
  const raw = Buffer.alloc((rowLen + 1) * height);
  for (let y = 0; y < height; y++) {
    const off = y * (rowLen + 1);
    raw[off] = 0; // filter type: none
    for (let x = 0; x < width; x++) {
      const p = off + 1 + x * 3;
      raw[p] = r;
      raw[p + 1] = g;
      raw[p + 2] = b;
    }
  }

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function write(relPath, buf) {
  const out = resolve(PUBLIC, relPath);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, buf);
  return out;
}

const assets = [
  ['icons/icon-192.png', solidPng(192, 192, BRAND)],
  ['icons/icon-512.png', solidPng(512, 512, BRAND)],
  ['icons/icon-512-maskable.png', solidPng(512, 512, MASKABLE_BG)],
  ['screenshots/booking-mobile.png', solidPng(1080, 1920, BRAND)],
  ['screenshots/admin-desktop.png', solidPng(1920, 1080, BRAND)],
  // Marketing-home hero (task 5.1; R9.1, R9.4). LCP-critical image: it is
  // preloaded and carries `fetchpriority="high"` on the page. Two widths back
  // the responsive `srcset`; replace with final editorial salon photography.
  ['hero/hero-1280.png', solidPng(1280, 720, BRAND)],
  ['hero/hero-640.png', solidPng(640, 360, BRAND)],
  // Branded default Open Graph image (1200×630, seo §4) referenced by the
  // SEO config's DEFAULT_OG_IMAGE so social shares resolve to a real file.
  ['og/default.jpg', solidPng(1200, 630, BRAND)],
];

for (const [rel, buf] of assets) {
  write(rel, buf);
}

/**
 * The content images that pages serve via `<picture>` (task 11.2; R9.5). For
 * each we emit an AVIF and a WebP variant alongside the existing PNG/JPG
 * fallback, at the same pixel dimensions (so the explicit `width`/`height` and
 * `aspect-ratio` stay valid and CLS-safe regardless of which format the browser
 * picks). PWA icons/screenshots are excluded — they are install chrome, not
 * page content.
 */
const CONTENT_IMAGES = [
  ['hero/hero-1280.png', 1280, 720],
  ['hero/hero-640.png', 640, 360],
  ['og/default.jpg', 1200, 630],
];

let modernCount = 0;
for (const [rel, width, height] of CONTENT_IMAGES) {
  const base = solidPng(width, height, BRAND);
  // Strip the file extension to derive the AVIF/WebP sibling paths.
  const stem = rel.replace(/\.(png|jpe?g)$/i, '');
  const avif = await sharp(base).avif({ quality: 50 }).toBuffer();
  const webp = await sharp(base).webp({ quality: 70 }).toBuffer();
  write(`${stem}.avif`, avif);
  write(`${stem}.webp`, webp);
  modernCount += 2;
}

// eslint-disable-next-line no-console
console.log(
  `[pwa-assets] wrote ${assets.length} placeholder PNG/JPG assets and ` +
    `${modernCount} AVIF/WebP variants to public/`,
);
