/**
 * Internal helper: generates 1x1 pixel placeholder files for all responsive
 * image variants referenced by the <Picture> component and srcset attributes.
 * 
 * These are dev-time placeholders so the build succeeds and paths resolve.
 * For production, replace with real images via `scripts/process-images.mjs`.
 *
 * Run: node scripts/_gen-responsive-placeholders.mjs
 */
import sharp from 'sharp';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(HERE, '../public/images');
const SALONS = resolve(PUBLIC, 'salons');

const BRAND_COLOR = { r: 142, g: 47, b: 80 };

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

async function placeholder(outPath, format) {
  const img = sharp({ create: { width: 1, height: 1, channels: 3, background: BRAND_COLOR } });
  if (format === 'avif') await img.avif({ quality: 50 }).toFile(outPath);
  else if (format === 'webp') await img.webp({ quality: 75 }).toFile(outPath);
  else if (format === 'jpg') await img.jpeg({ quality: 80 }).toFile(outPath);
}

async function main() {
  ensureDir(PUBLIC);
  ensureDir(SALONS);

  let count = 0;

  // Benefit images: need 640w AVIF + 640w/960w WebP
  const benefits = ['benefit-no-shows', 'benefit-online-booking', 'benefit-calendar'];
  for (const name of benefits) {
    // 640w AVIF
    const avif640 = resolve(PUBLIC, `${name}-640w.avif`);
    if (!existsSync(avif640)) {
      await placeholder(avif640, 'avif');
      count++;
    }
    // 640w WebP
    const webp640 = resolve(PUBLIC, `${name}-640w.webp`);
    if (!existsSync(webp640)) {
      await placeholder(webp640, 'webp');
      count++;
    }
    // 960w WebP
    const webp960 = resolve(PUBLIC, `${name}-960w.webp`);
    if (!existsSync(webp960)) {
      await placeholder(webp960, 'webp');
      count++;
    }
  }

  // Hero: need 960w WebP and 1920w WebP
  for (const w of [960, 1920]) {
    const p = resolve(PUBLIC, `hero-salon-interior-${w}w.webp`);
    if (!existsSync(p)) {
      await placeholder(p, 'webp');
      count++;
    }
  }

  // Salon cards: need AVIF + WebP at 640w
  for (let i = 1; i <= 6; i++) {
    const avifPath = resolve(SALONS, `salon-card-${i}-640w.avif`);
    if (!existsSync(avifPath)) {
      await placeholder(avifPath, 'avif');
      count++;
    }
    const webpPath = resolve(SALONS, `salon-card-${i}-640w.webp`);
    if (!existsSync(webpPath)) {
      await placeholder(webpPath, 'webp');
      count++;
    }
  }

  console.log(`[responsive-placeholders] Generated ${count} new placeholder file(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
