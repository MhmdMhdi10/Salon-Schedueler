/**
 * Image processing pipeline for the Salon Booking PWA (task 8.3; Req 9.3, 9.4, 13.5).
 *
 * Processes source images (JPEG/PNG) into responsive AVIF/WebP/JPEG variants at
 * standard breakpoint widths for use with the `<Picture>` component.
 *
 * ## Pipeline Output
 *
 * For each source image, the script generates:
 *
 * | Format | Quality | Sizes (default)      | Sizes (hero)                |
 * |--------|---------|----------------------|-----------------------------|
 * | AVIF   | 50–55   | 640w, 960w, 1280w    | 640w, 960w, 1280w, 1920w   |
 * | WebP   | 75      | 640w, 960w, 1280w    | 640w, 960w, 1280w, 1920w   |
 * | JPEG   | 80      | 1280w (fallback)     | 1280w (fallback)            |
 *
 * ## Usage
 *
 * ```bash
 * # Process all images in a source directory:
 * node scripts/process-images.mjs --input src-images/ --output public/images/
 *
 * # Process a single image (hero):
 * node scripts/process-images.mjs --input src-images/hero.jpg --output public/images/ --prefix hero-salon-interior --hero
 *
 * # Process with custom sizes:
 * node scripts/process-images.mjs --input src-images/card.jpg --output public/images/salons/ --prefix salon-card-1 --sizes 640,960
 *
 * # Dry run (show what would be generated):
 * node scripts/process-images.mjs --input src-images/ --output public/images/ --dry-run
 * ```
 *
 * ## Directory Conventions
 *
 * Place source images in `src-images/` (gitignored). The script outputs to `public/images/`
 * (committed as placeholders during development, replaced with real photography for production).
 *
 * ## Integration with <Picture> Component
 *
 * The output files are consumed by the `<Picture>` component (`components/ui/Picture.tsx`):
 *
 * ```tsx
 * <Picture
 *   sources={[
 *     { type: 'image/avif', srcSet: '/images/hero-salon-interior-640w.avif 640w, /images/hero-salon-interior-960w.avif 960w, /images/hero-salon-interior-1280w.avif 1280w' },
 *     { type: 'image/webp', srcSet: '/images/hero-salon-interior-640w.webp 640w, /images/hero-salon-interior-960w.webp 960w, /images/hero-salon-interior-1280w.webp 1280w' },
 *   ]}
 *   src="/images/hero-salon-interior-1280w.jpg"
 *   fallbackSrcSet="/images/hero-salon-interior-640w.jpg 640w, /images/hero-salon-interior-1280w.jpg 1280w"
 *   sizes="(min-width: 1024px) 50vw, 100vw"
 *   width={1280}
 *   height={720}
 *   alt="..."
 *   loading="lazy"
 * />
 * ```
 *
 * @see docs/design-research/image-sourcing.md — full sourcing guide
 * @see docs/design-research/photography-direction.md — NYC editorial style guide
 */
import { mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, basename, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(HERE, '..');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Standard responsive widths for content images. */
const STANDARD_SIZES = [640, 960, 1280];

/** Hero images include an additional 1920w variant for full-bleed viewports. */
const HERO_SIZES = [640, 960, 1280, 1920];

/** Quality settings per format — balancing compression vs visual fidelity. */
const QUALITY = {
  avif: { quality: 52, effort: 4 }, // High compression, good quality
  webp: { quality: 75 },           // Broad compatibility fallback
  jpeg: { quality: 80 },           // Legacy fallback
};

/** Supported source image extensions. */
const SOURCE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.tiff', '.webp']);

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const { values: args } = parseArgs({
  options: {
    input: { type: 'string', short: 'i' },
    output: { type: 'string', short: 'o' },
    prefix: { type: 'string', short: 'p' },
    hero: { type: 'boolean', default: false },
    sizes: { type: 'string' },
    'aspect-ratio': { type: 'string', default: '16:9' },
    'dry-run': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
  strict: true,
});

if (args.help) {
  console.log(`
Usage: node scripts/process-images.mjs [options]

Options:
  -i, --input <path>       Source image or directory of images
  -o, --output <path>      Output directory (default: public/images/)
  -p, --prefix <name>      Output filename prefix (used for single-file input)
  --hero                   Include 1920w variant for hero/full-bleed images
  --sizes <list>           Comma-separated width list (overrides default 640,960,1280)
  --aspect-ratio <w:h>     Target aspect ratio for cropping (default: 16:9)
  --dry-run                Show planned output without writing files
  -h, --help               Show this help message

Examples:
  # Process entire directory:
  node scripts/process-images.mjs -i src-images/hero/ -o public/images/ --hero

  # Process single source for salon card:
  node scripts/process-images.mjs -i src-images/salon-modern.jpg -o public/images/salons/ -p salon-card-1

  # Custom sizes with 4:3 aspect ratio for benefit images:
  node scripts/process-images.mjs -i src-images/benefits/ -o public/images/ --sizes 640,960 --aspect-ratio 4:3
  `);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Core processing logic
// ---------------------------------------------------------------------------

/**
 * Parse aspect ratio string (e.g. "16:9") into width/height multipliers.
 */
function parseAspectRatio(ratioStr) {
  const [w, h] = ratioStr.split(':').map(Number);
  if (!w || !h || isNaN(w) || isNaN(h)) {
    throw new Error(`Invalid aspect ratio: "${ratioStr}". Use format "16:9" or "4:3".`);
  }
  return { w, h };
}

/**
 * Calculate the height for a given width based on aspect ratio.
 */
function heightForWidth(width, aspectRatio) {
  return Math.round((width * aspectRatio.h) / aspectRatio.w);
}

/**
 * Process a single source image into all responsive variants.
 *
 * @param {string} inputPath — absolute path to the source image
 * @param {string} outputDir — absolute path to the output directory
 * @param {string} prefix — filename prefix (e.g. "hero-salon-interior")
 * @param {number[]} sizes — widths to generate
 * @param {{w: number, h: number}} aspectRatio — target aspect ratio
 * @param {boolean} dryRun — if true, only log planned output
 * @returns {Promise<string[]>} — list of generated file paths
 */
async function processImage(inputPath, outputDir, prefix, sizes, aspectRatio, dryRun) {
  const generated = [];

  if (!dryRun) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Load the source image once
  const source = sharp(inputPath);
  const metadata = await source.metadata();

  if (!metadata.width || !metadata.height) {
    console.warn(`  [skip] Cannot read dimensions: ${inputPath}`);
    return generated;
  }

  // Warn if source is smaller than the largest target size
  const maxTarget = Math.max(...sizes);
  if (metadata.width < maxTarget) {
    console.warn(
      `  [warn] Source (${metadata.width}px) is narrower than largest target (${maxTarget}px): ${inputPath}`,
    );
  }

  for (const width of sizes) {
    const height = heightForWidth(width, aspectRatio);

    // --- AVIF variant ---
    const avifName = `${prefix}-${width}w.avif`;
    const avifPath = resolve(outputDir, avifName);
    if (dryRun) {
      console.log(`  [dry-run] ${avifName} (${width}x${height})`);
    } else {
      await sharp(inputPath)
        .resize(width, height, { fit: 'cover', position: 'attention' })
        .avif(QUALITY.avif)
        .toFile(avifPath);
      console.log(`  ✓ ${avifName}`);
    }
    generated.push(avifPath);

    // --- WebP variant ---
    const webpName = `${prefix}-${width}w.webp`;
    const webpPath = resolve(outputDir, webpName);
    if (dryRun) {
      console.log(`  [dry-run] ${webpName} (${width}x${height})`);
    } else {
      await sharp(inputPath)
        .resize(width, height, { fit: 'cover', position: 'attention' })
        .webp(QUALITY.webp)
        .toFile(webpPath);
      console.log(`  ✓ ${webpName}`);
    }
    generated.push(webpPath);
  }

  // --- JPEG fallback (at 1280w, or the largest requested size) ---
  const fallbackWidth = sizes.includes(1280) ? 1280 : Math.max(...sizes);
  const fallbackHeight = heightForWidth(fallbackWidth, aspectRatio);
  const jpegName = `${prefix}-${fallbackWidth}w.jpg`;
  const jpegPath = resolve(outputDir, jpegName);
  if (dryRun) {
    console.log(`  [dry-run] ${jpegName} (${fallbackWidth}x${fallbackHeight}) [JPEG fallback]`);
  } else {
    await sharp(inputPath)
      .resize(fallbackWidth, fallbackHeight, { fit: 'cover', position: 'attention' })
      .jpeg(QUALITY.jpeg)
      .toFile(jpegPath);
    console.log(`  ✓ ${jpegName} [fallback]`);
  }
  generated.push(jpegPath);

  return generated;
}

/**
 * Collect all processable images from a directory.
 */
function collectSourceImages(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = resolve(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isFile() && SOURCE_EXTENSIONS.has(extname(entry).toLowerCase())) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

/**
 * Derive a prefix from a source filename.
 * E.g. "hero-salon-interior.jpg" → "hero-salon-interior"
 */
function prefixFromFilename(filePath) {
  return basename(filePath, extname(filePath));
}

// ---------------------------------------------------------------------------
// Main execution
// ---------------------------------------------------------------------------

async function main() {
  const inputPath = args.input ? resolve(PROJECT_ROOT, args.input) : null;
  const outputDir = resolve(PROJECT_ROOT, args.output || 'public/images');
  const isHero = args.hero || false;
  const dryRun = args['dry-run'] || false;
  const aspectRatio = parseAspectRatio(args['aspect-ratio'] || '16:9');

  // Determine sizes
  let sizes = isHero ? HERO_SIZES : STANDARD_SIZES;
  if (args.sizes) {
    sizes = args.sizes.split(',').map((s) => parseInt(s.trim(), 10)).filter(Boolean);
  }

  if (!inputPath) {
    console.error('Error: --input is required. Use --help for usage.');
    process.exit(1);
  }

  if (!existsSync(inputPath)) {
    console.error(`Error: Input path does not exist: ${inputPath}`);
    process.exit(1);
  }

  const stat = statSync(inputPath);
  let totalGenerated = 0;

  if (stat.isFile()) {
    // Single file mode
    const prefix = args.prefix || prefixFromFilename(inputPath);
    console.log(`\nProcessing: ${basename(inputPath)} → ${prefix}`);
    const files = await processImage(inputPath, outputDir, prefix, sizes, aspectRatio, dryRun);
    totalGenerated = files.length;
  } else if (stat.isDirectory()) {
    // Directory mode
    const sourceFiles = collectSourceImages(inputPath);
    if (sourceFiles.length === 0) {
      console.log(`No processable images found in: ${inputPath}`);
      console.log(`Supported formats: ${[...SOURCE_EXTENSIONS].join(', ')}`);
      process.exit(0);
    }

    console.log(`\nProcessing ${sourceFiles.length} image(s) from: ${inputPath}`);
    console.log(`Output: ${outputDir}`);
    console.log(`Sizes: ${sizes.join(', ')}w`);
    console.log(`Aspect ratio: ${args['aspect-ratio'] || '16:9'}`);
    console.log(`Formats: AVIF (q${QUALITY.avif.quality}), WebP (q${QUALITY.webp.quality}), JPEG (q${QUALITY.jpeg.quality})`);
    console.log('');

    for (const file of sourceFiles) {
      const prefix = args.prefix
        ? `${args.prefix}-${sourceFiles.indexOf(file) + 1}`
        : prefixFromFilename(file);
      console.log(`  ${basename(file)} → ${prefix}`);
      const files = await processImage(file, outputDir, prefix, sizes, aspectRatio, dryRun);
      totalGenerated += files.length;
    }
  }

  console.log(
    `\n[process-images] ${dryRun ? 'Would generate' : 'Generated'} ${totalGenerated} files ` +
      `(${sizes.length} sizes × 3 formats per source image)`,
  );
}

main().catch((err) => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
