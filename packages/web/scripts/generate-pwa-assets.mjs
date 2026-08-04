/**
 * Generates the PWA + content raster assets the app references
 * (task 4.5 / 5.1 / 11.2; R9.1, R9.4, R9.5, R9.6, R11.1, R11.2):
 *
 *  - the 192/512 "any" PWA icons + 512×512 maskable icon (manifest chrome),
 *  - the آرا bloom PWA icons,
 *  - the **marketing hero** at two responsive widths (the LCP image), and
 *  - the default Open Graph share image,
 *
 * each in a PNG/JPEG fallback plus modern AVIF/WebP variants (for the hero/OG
 * `<picture>` sources) at identical pixel dimensions so the explicit
 * `width`/`height` stays CLS-safe regardless of the format the browser picks.
 *
 * The hero + OG are a real **salon-luxe** illustration (warm porcelain ground,
 * a teal arched mirror, a turquoise "petal-arc" floral bloom and a few
 * glam sparkles) — drawn as an SVG in the shipped palette and rasterized with
 * `sharp` — not a flat brand swatch. Install screenshots are real captures
 * committed under `public/screenshots/`; this script never overwrites them. Run:
 * `node scripts/generate-pwa-assets.mjs`.
 *
 * NOTE: the salon-luxe palette below is duplicated as plain hex *data* for this
 * build-time asset (it never enters scanned `src/**` styles); the authoritative
 * tokens live in `styles/tokens.css` / `@salon/shared`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(HERE, '../public');

function write(relPath, buf) {
  const out = resolve(PUBLIC, relPath);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, buf);
  return out;
}

// ---------------------------------------------------------------------------
// Salon-luxe hero illustration (SVG, rasterized by sharp).
// ---------------------------------------------------------------------------

// Self-contained illustration palette (warm salon-luxe). These are asset data,
// not authored UI styles — the live UI consumes tokens from tokens.css.
const ART = {
  creamTop: '#FCEFE6',
  creamBot: '#EFDCC9',
  sand: '#E7D2BD',
  tealLight: '#10A990',
  teal: '#0B7A68',
  tealDark: '#075348',
  clay: '#05CFA6',
  clayLight: '#45E6C5',
  blush: '#B8EDE5',
  blushSoft: '#DDF8F3',
  mirrorTop: '#DDF8F3',
  mirrorBot: '#75DCC8',
  cream: '#FFF7EF',
  white: '#FFFFFF',
};

/** One "petal-arc" flower (the brand motif) centered at (cx,cy), scaled `s`. */
function flower({ cx, cy, s, a, b, hub, rot = 0, opacity = 1 }) {
  const PETAL = 'M24 24 C 18 16 18 8 24 4 C 30 8 30 16 24 24 Z';
  const petals = [0, 72, 144, 216, 288]
    .map(
      (ang, i) =>
        `<path d="${PETAL}" transform="rotate(${ang} 24 24)" fill="${i % 2 === 0 ? a : b}"/>`,
    )
    .join('');
  return `<g transform="translate(${cx} ${cy}) scale(${s}) rotate(${rot})" opacity="${opacity}"><g transform="translate(-24 -24)">${petals}<circle cx="24" cy="24" r="4" fill="${hub}"/></g></g>`;
}

/** A four-point glam sparkle centered at (cx,cy). */
function sparkle({ cx, cy, s, fill, opacity = 1 }) {
  const P =
    'M0 -10 C 1.6 -3 3 -1.6 10 0 C 3 1.6 1.6 3 0 10 C -1.6 3 -3 1.6 -10 0 C -3 -1.6 -1.6 -3 0 -10 Z';
  return `<path d="${P}" transform="translate(${cx} ${cy}) scale(${s})" fill="${fill}" opacity="${opacity}"/>`;
}

/**
 * The hero illustration at 1280×720. An editorial salon-luxe composition: a
 * warm porcelain ground with a soft glow, an arched teal mirror with a glassy
 * mint interior, a turquoise floral bloom that overlaps the arch, fine
 * ripple arcs, and a scatter of glam sparkles + blush bokeh in the calm corner.
 */
function buildHeroSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${ART.creamTop}"/>
      <stop offset="1" stop-color="${ART.creamBot}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.72" cy="0.16" r="0.85">
      <stop offset="0" stop-color="${ART.white}" stop-opacity="0.7"/>
      <stop offset="1" stop-color="${ART.white}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="teal" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${ART.tealLight}"/>
      <stop offset="1" stop-color="${ART.tealDark}"/>
    </linearGradient>
    <linearGradient id="mirror" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${ART.mirrorTop}"/>
      <stop offset="1" stop-color="${ART.mirrorBot}"/>
    </linearGradient>
  </defs>

  <!-- Ground -->
  <rect width="1280" height="720" fill="url(#bg)"/>
  <rect width="1280" height="720" fill="url(#glow)"/>
  <rect x="0" y="606" width="1280" height="114" fill="${ART.sand}" opacity="0.55"/>

  <!-- Blush bokeh in the calm corner -->
  <circle cx="226" cy="180" r="74" fill="${ART.blushSoft}" opacity="0.5"/>
  <circle cx="372" cy="120" r="30" fill="${ART.blush}" opacity="0.45"/>
  <circle cx="138" cy="372" r="44" fill="${ART.blushSoft}" opacity="0.4"/>
  <circle cx="300" cy="470" r="20" fill="${ART.blush}" opacity="0.4"/>

  <!-- Arch (mirror) contact shadow -->
  <ellipse cx="930" cy="608" rx="214" ry="18" fill="${ART.tealDark}" opacity="0.12"/>

  <!-- Outer arch frame stroke -->
  <path d="M716 606 L716 270 A214 214 0 0 1 1144 270 L1144 606" fill="none" stroke="${ART.clay}" stroke-width="3" opacity="0.45"/>

  <!-- Arch (mirror) -->
  <path d="M730 606 L730 278 A200 200 0 0 1 1130 278 L1130 606 Z" fill="url(#teal)"/>
  <!-- Glassy mirror interior (offset inset) -->
  <path d="M752 606 L752 292 A178 178 0 0 1 1108 292 L1108 606 Z" fill="url(#mirror)" opacity="0.95"/>
  <!-- A soft highlight streak on the glass -->
  <path d="M812 320 L884 320 L792 596 L720 596 Z" fill="${ART.white}" opacity="0.18"/>

  <!-- Ripple arcs behind the bloom -->
  <circle cx="724" cy="486" r="150" fill="none" stroke="${ART.clay}" stroke-width="2" opacity="0.16"/>
  <circle cx="724" cy="486" r="190" fill="none" stroke="${ART.clay}" stroke-width="2" opacity="0.1"/>

  <!-- Bloom contact shadow -->
  <ellipse cx="724" cy="606" rx="150" ry="16" fill="${ART.tealDark}" opacity="0.1"/>

  <!-- Floral bloom (brand petal-arc motif) -->
  ${flower({ cx: 560, cy: 470, s: 1.7, a: ART.tealLight, b: ART.clay, hub: ART.cream, rot: 12, opacity: 0.92 })}
  ${flower({ cx: 648, cy: 566, s: 2.7, a: ART.clay, b: ART.tealLight, hub: ART.cream, rot: -8, opacity: 0.96 })}
  ${flower({ cx: 724, cy: 470, s: 4.2, a: ART.teal, b: ART.clay, hub: ART.cream, rot: 0 })}
  ${flower({ cx: 868, cy: 540, s: 1.5, a: ART.clayLight, b: ART.teal, hub: ART.cream, rot: 18, opacity: 0.9 })}

  <!-- Glam sparkles -->
  ${sparkle({ cx: 1044, cy: 168, s: 2.3, fill: ART.clayLight, opacity: 0.9 })}
  ${sparkle({ cx: 980, cy: 120, s: 1.3, fill: ART.teal, opacity: 0.8 })}
  ${sparkle({ cx: 700, cy: 250, s: 1.7, fill: ART.clay, opacity: 0.85 })}
  ${sparkle({ cx: 596, cy: 360, s: 1.0, fill: ART.tealLight, opacity: 0.8 })}
  ${sparkle({ cx: 940, cy: 470, s: 1.4, fill: ART.cream, opacity: 0.85 })}
</svg>`;
}

// ---------------------------------------------------------------------------
// Emit assets.
// ---------------------------------------------------------------------------

const appIconSource = readFileSync(resolve(PUBLIC, 'brand/ara-app-icon-source.png'));
const horizontalLogo = resolve(PUBLIC, 'brand/ara-logo.png');

// Browser tabs need a tight transparent mark. Reusing the padded install icon
// makes the logo look like a tiny white square at 16–32 px.
const favicon = await sharp(horizontalLogo)
  .extract({ left: 496, top: 0, width: 459, height: 480 })
  .trim({ background: { r: 255, g: 255, b: 255, alpha: 0 } })
  .resize(30, 30, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .extend({ top: 1, bottom: 1, left: 1, right: 1, background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();
write('icons/favicon-32.png', favicon);

for (const size of [192, 512]) {
  const icon = await sharp(appIconSource).resize(size, size).png().toBuffer();
  const maskable = await sharp(appIconSource).resize(size, size).png().toBuffer();
  write(`icons/icon-${size}.png`, icon);
  write(`icons/icon-${size}-maskable.png`, maskable);
}

// Marketing hero (task 5.1; R9.1, R9.4) — the LCP image. A real salon-luxe
// illustration rasterized from SVG, at two responsive widths, each with an
// AVIF + WebP sibling at identical dimensions (CLS-safe `<picture>` sources).
const heroSvg = Buffer.from(buildHeroSvg());
const hero1280 = await sharp(heroSvg).png({ compressionLevel: 9 }).toBuffer();
const hero640 = await sharp(hero1280).resize(640, 360).png({ compressionLevel: 9 }).toBuffer();

const HERO_VARIANTS = [
  ['hero/hero-1280', hero1280],
  ['hero/hero-640', hero640],
];

let modernCount = 0;
for (const [stem, png] of HERO_VARIANTS) {
  write(`${stem}.png`, png);
  write(`${stem}.avif`, await sharp(png).avif({ quality: 55 }).toBuffer());
  write(`${stem}.webp`, await sharp(png).webp({ quality: 78 }).toBuffer());
  modernCount += 2;
}

// Default Open Graph share image (1200×630, seo §4): the same branded artwork,
// cover-cropped to the social aspect, as a JPEG (referenced by DEFAULT_OG_IMAGE).
const og = await sharp(hero1280)
  .resize(1200, 630, { fit: 'cover', position: 'attention' })
  .jpeg({ quality: 82 })
  .toBuffer();
write('og/default.jpg', og);

// eslint-disable-next-line no-console
console.log(
  `[pwa-assets] wrote 4 آرا smart-calendar icons, ` +
    `${HERO_VARIANTS.length} hero PNGs + ${modernCount} AVIF/WebP variants, ` +
    `and the OG share image to public/`,
);
