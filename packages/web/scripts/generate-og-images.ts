/**
 * OG Image Generation Script
 * ===========================
 *
 * Generates branded Open Graph images (1200×630) for the salon booking platform.
 * These images are used for social sharing previews on Twitter, Facebook, Telegram, etc.
 *
 * ## Brand Guidelines
 * - Background: Dark noir (#0A0A0A)
 * - Primary accent: NYC Magenta (#D81B60)
 * - Text color: Luminous white (#FAFAFA)
 * - Muted text: #A8A8A8
 * - Font: Vazirmatn (Persian, RTL)
 * - Layout: RTL-correct, text flows right-to-left
 * - Output: 1200×630 PNG/JPEG at quality 85
 *
 * ## Template Layout
 * ┌─────────────────────────────────────────────────────┐
 * │ [Magenta accent strip — 6px]                        │
 * │                                                     │
 * │        [Brand petal motif — subtle, decorative]     │
 * │                                                     │
 * │             «رزرو سالن» (72px, bold 800)            │
 * │        «رزرو آنلاین نوبت سالن‌های زیبایی»           │
 * │             [Magenta divider line]                  │
 * │                                                     │
 * │   Per-salon variant:                                │
 * │     - Salon name (48px, bold)                       │
 * │     - City/neighborhood (24px, muted)               │
 * │     - Magenta accent bar                            │
 * │                                                     │
 * │ [Magenta accent strip — 6px]                        │
 * └─────────────────────────────────────────────────────┘
 *
 * ## Usage
 *
 * ### Default branded image (already exists as SVG at public/og/default.svg):
 *   npx tsx scripts/generate-og-images.ts --default
 *
 * ### Per-salon OG image:
 *   npx tsx scripts/generate-og-images.ts --salon "سالن رز" --city "تهران، ولنجک"
 *
 * ### All salons from database:
 *   npx tsx scripts/generate-og-images.ts --all
 *
 * ## Dependencies (install before running)
 *
 * Option A — Using @vercel/og (recommended for edge/serverless):
 *   pnpm add @vercel/og
 *   - Renders React JSX to PNG using Satori + resvg-js
 *   - Handles RTL text natively with font embedding
 *   - Best for on-demand generation at the edge
 *
 * Option B — Using sharp + @napi-rs/canvas (recommended for build-time):
 *   pnpm add sharp @napi-rs/canvas
 *   - sharp: Fast image processing (resize, format conversion, quality)
 *   - @napi-rs/canvas: Node.js canvas for text rendering
 *   - Best for batch generation at build time
 *
 * Option C — Using puppeteer/playwright (simplest but slowest):
 *   pnpm add puppeteer
 *   - Renders the SVG template in a headless browser
 *   - Screenshots at 1200×630
 *   - Slowest but most accurate font rendering
 *
 * ## RTL Text Rendering Considerations
 *
 * Persian/Arabic text in OG images requires careful handling:
 *
 * 1. **Font embedding**: The Vazirmatn font file (.woff2 or .ttf) must be loaded
 *    into the rendering engine. Social platforms won't render Persian text without
 *    the correct font embedded in the image itself.
 *
 * 2. **Text shaping**: Persian characters connect (cursive script). Libraries like
 *    Satori (used by @vercel/og) handle Arabic script shaping. If using canvas
 *    directly, ensure the engine supports HarfBuzz or equivalent shaping.
 *
 * 3. **Bidirectional text**: When mixing Persian with Latin (e.g., a salon name
 *    containing English words), use Unicode bidi algorithm. Most rendering engines
 *    handle this if `direction: rtl` is set.
 *
 * 4. **Text alignment**: All text should be center-aligned for OG images (it's
 *    a visual card, not a document). The Persian text naturally reads RTL within
 *    the centered block.
 *
 * 5. **Digit rendering**: Use Persian/Eastern-Arabic numerals (۰-۹) for any
 *    numbers displayed (ratings, prices, counts).
 *
 * ## Implementation Example (@vercel/og approach)
 *
 * ```tsx
 * import { ImageResponse } from '@vercel/og';
 * import { readFileSync } from 'fs';
 * import { join } from 'path';
 *
 * // Load Vazirmatn font for embedding
 * const vazirmatn = readFileSync(
 *   join(__dirname, '../public/fonts/vazirmatn-var.woff2')
 * );
 *
 * interface OgImageOptions {
 *   title: string;       // e.g. "رزرو سالن" or salon name
 *   subtitle?: string;   // e.g. "رزرو آنلاین نوبت سالن‌های زیبایی" or city
 *   brandName?: string;  // Platform name — defaults to "رزرو سالن"
 * }
 *
 * export async function generateOgImage(options: OgImageOptions): Promise<Buffer> {
 *   const { title, subtitle, brandName = 'رزرو سالن' } = options;
 *
 *   const response = new ImageResponse(
 *     (
 *       <div
 *         style={{
 *           width: '1200px',
 *           height: '630px',
 *           display: 'flex',
 *           flexDirection: 'column',
 *           alignItems: 'center',
 *           justifyContent: 'center',
 *           backgroundColor: '#0A0A0A',
 *           fontFamily: 'Vazirmatn',
 *           direction: 'rtl',
 *           position: 'relative',
 *         }}
 *       >
 *         {/- Top magenta strip -/}
 *         <div style={{
 *           position: 'absolute', top: 0, left: 0, right: 0,
 *           height: '6px',
 *           background: 'linear-gradient(to right, #D81B60, #FF6B9D)',
 *         }} />
 *
 *         {/- Main title -/}
 *         <div style={{
 *           fontSize: '72px',
 *           fontWeight: 800,
 *           color: '#FAFAFA',
 *           marginBottom: '16px',
 *         }}>
 *           {title}
 *         </div>
 *
 *         {/- Subtitle -/}
 *         {subtitle && (
 *           <div style={{
 *             fontSize: '28px',
 *             fontWeight: 400,
 *             color: '#A8A8A8',
 *             marginBottom: '24px',
 *           }}>
 *             {subtitle}
 *           </div>
 *         )}
 *
 *         {/- Magenta divider -/}
 *         <div style={{
 *           width: '240px', height: '4px',
 *           backgroundColor: '#D81B60',
 *           borderRadius: '2px',
 *         }} />
 *
 *         {/- Brand name (if showing a salon) -/}
 *         {title !== brandName && (
 *           <div style={{
 *             position: 'absolute', bottom: '48px',
 *             fontSize: '20px',
 *             color: '#5B6573',
 *           }}>
 *             {brandName}
 *           </div>
 *         )}
 *
 *         {/- Bottom magenta strip -/}
 *         <div style={{
 *           position: 'absolute', bottom: 0, left: 0, right: 0,
 *           height: '6px',
 *           background: 'linear-gradient(to right, #D81B60, #FF6B9D)',
 *         }} />
 *       </div>
 *     ),
 *     {
 *       width: 1200,
 *       height: 630,
 *       fonts: [
 *         {
 *           name: 'Vazirmatn',
 *           data: vazirmatn,
 *           style: 'normal',
 *           weight: 400,
 *         },
 *         {
 *           name: 'Vazirmatn',
 *           data: vazirmatn,
 *           style: 'normal',
 *           weight: 800,
 *         },
 *       ],
 *     },
 *   );
 *
 *   return Buffer.from(await response.arrayBuffer());
 * }
 * ```
 *
 * ## Per-Salon OG Image Generation
 *
 * For generating per-salon OG images at build time:
 *
 * ```ts
 * import { writeFileSync, mkdirSync } from 'fs';
 * import { join } from 'path';
 *
 * interface Salon {
 *   slug: string;
 *   name: string;
 *   city: string;
 *   neighborhood?: string;
 * }
 *
 * async function generateAllSalonOgImages(salons: Salon[]) {
 *   const outputDir = join(__dirname, '../public/og/salons');
 *   mkdirSync(outputDir, { recursive: true });
 *
 *   for (const salon of salons) {
 *     const subtitle = salon.neighborhood
 *       ? `${salon.city}، ${salon.neighborhood}`
 *       : salon.city;
 *
 *     const buffer = await generateOgImage({
 *       title: salon.name,
 *       subtitle,
 *     });
 *
 *     writeFileSync(join(outputDir, `${salon.slug}.png`), buffer);
 *     console.log(`Generated OG image for: ${salon.name} → og/salons/${salon.slug}.png`);
 *   }
 * }
 * ```
 *
 * ## Converting SVG to PNG/JPEG (for the default image)
 *
 * The default.svg can be converted to production formats using sharp:
 *
 * ```ts
 * import sharp from 'sharp';
 * import { readFileSync } from 'fs';
 * import { join } from 'path';
 *
 * async function convertDefaultOg() {
 *   const svgPath = join(__dirname, '../public/og/default.svg');
 *   const svgBuffer = readFileSync(svgPath);
 *
 *   // Generate JPEG (primary — best social platform compatibility)
 *   await sharp(svgBuffer)
 *     .resize(1200, 630)
 *     .jpeg({ quality: 85, progressive: true })
 *     .toFile(join(__dirname, '../public/og/default.jpg'));
 *
 *   // Generate WebP (modern platforms)
 *   await sharp(svgBuffer)
 *     .resize(1200, 630)
 *     .webp({ quality: 85 })
 *     .toFile(join(__dirname, '../public/og/default.webp'));
 *
 *   // Generate AVIF (best compression, newer platforms)
 *   await sharp(svgBuffer)
 *     .resize(1200, 630)
 *     .avif({ quality: 75 })
 *     .toFile(join(__dirname, '../public/og/default.avif'));
 *
 *   console.log('Default OG images generated: .jpg, .webp, .avif');
 * }
 * ```
 *
 * ## Notes
 *
 * - The default OG image is referenced in `src/components/seo/config.ts` as
 *   `DEFAULT_OG_IMAGE` → `/og/default.jpg`
 * - Per-salon OG images should be referenced in `SalonProfilePage.tsx` via
 *   `<SeoHead image={salonOgImageUrl} />`
 * - Social platforms (Twitter, Telegram, Facebook) prefer JPEG/PNG over SVG
 *   for OG images — always serve raster formats via the og:image meta tag
 * - The SVG template (`default.svg`) serves as the source of truth for the
 *   brand layout; convert to raster for production use
 */

// Script entry point (stub — install dependencies to run)
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.length === 0) {
    console.log(`
OG Image Generator — رزرو سالن
================================

Usage:
  npx tsx scripts/generate-og-images.ts --default       Generate default branded OG image
  npx tsx scripts/generate-og-images.ts --salon "نام"   Generate OG for a specific salon
  npx tsx scripts/generate-og-images.ts --all           Generate OG images for all salons
  npx tsx scripts/generate-og-images.ts --help          Show this help

Requirements:
  Install one of:
    pnpm add -D sharp @napi-rs/canvas    (build-time generation)
    pnpm add -D @vercel/og               (edge/serverless generation)

The SVG template is at: public/og/default.svg
Output formats: PNG (1200×630), JPEG (quality 85), WebP, AVIF
    `);
    process.exit(0);
  }

  console.error(
    'Error: Dependencies not installed. Run:\n' +
      '  pnpm add -D sharp\n' +
      'Then re-run this script.',
  );
  process.exit(1);
}

main().catch((err) => {
  console.error('OG image generation failed:', err);
  process.exit(1);
});
