# Image Assets — Landing Page & Marketing

This directory contains **development placeholder images** (1x1px solid-color files).
They exist so that referenced paths resolve during development and the build succeeds.

**For production, replace every file below with real salon photography** processed through
an AVIF/WebP/JPEG pipeline at the specified dimensions.

---

## Hero Section (ParallaxHero in MarketingHome)

Full-viewport background image for the landing page hero. Should be a high-quality,
editorially-lit salon interior photograph with NYC aesthetic (dramatic lighting,
confident composition, high contrast).

| File | Format | Width | Purpose |
|------|--------|-------|---------|
| `hero-salon-interior-640w.avif` | AVIF | 640px | Mobile (`srcset`) |
| `hero-salon-interior-960w.avif` | AVIF | 960px | Tablet (`srcset`) |
| `hero-salon-interior-1280w.avif` | AVIF | 1280px | Desktop (`srcset`) |
| `hero-salon-interior-1920w.avif` | AVIF | 1920px | Wide/hero full-bleed (LCP image) |
| `hero-salon-interior-640w.webp` | WebP | 640px | Mobile fallback |
| `hero-salon-interior-1280w.webp` | WebP | 1280px | Desktop fallback |
| `hero-salon-interior-1280w.jpg` | JPEG | 1280px | Legacy fallback |

**Aspect ratio:** 16:9 (1920x1080 at full size)
**Subject:** Stylish salon interior — mirrors, chairs, warm lighting, NYC-editorial feel
**LCP note:** The `1920w.avif` is the primary LCP element; it is preloaded with
`fetchpriority="high"` and `loading="eager"`.

---

## Benefits Section (OwnerBenefitsSection)

Editorial split-layout images showing salon owner value propositions.

| File | Format | Width | Purpose |
|------|--------|-------|---------|
| `benefit-no-shows-960w.avif` | AVIF | 960px | Reduced no-shows benefit |
| `benefit-online-booking-960w.avif` | AVIF | 960px | Online booking benefit |
| `benefit-calendar-960w.avif` | AVIF | 960px | Calendar management benefit |

**Aspect ratio:** 4:3 (960x720)
**Subjects:**
- `benefit-no-shows`: A busy, well-organized salon with every chair occupied
- `benefit-online-booking`: A customer on their phone, booking an appointment
- `benefit-calendar`: A salon owner reviewing their schedule/calendar on a tablet

---

## Image Processing Pipeline

For production, process source images with:

```bash
# Example using sharp-cli or similar
# AVIF (quality 50, effort 4 for good compression)
sharp -i source.jpg -o hero-salon-interior-1920w.avif --format avif --quality 50
sharp -i source.jpg -o hero-salon-interior-1280w.avif --format avif --quality 50 --width 1280
sharp -i source.jpg -o hero-salon-interior-960w.avif --format avif --quality 50 --width 960
sharp -i source.jpg -o hero-salon-interior-640w.avif --format avif --quality 50 --width 640

# WebP (quality 75 for fallback)
sharp -i source.jpg -o hero-salon-interior-1280w.webp --format webp --quality 75 --width 1280
sharp -i source.jpg -o hero-salon-interior-640w.webp --format webp --quality 75 --width 640

# JPEG legacy fallback (quality 80)
sharp -i source.jpg -o hero-salon-interior-1280w.jpg --format jpeg --quality 80 --width 1280
```

Or use the build script: `node scripts/generate-placeholder-images.mjs`
(currently generates 1x1px placeholders — adapt for production pipeline).

---

## Salon Discovery Cards (`/salons/`)

SVG placeholders for salon cards on discovery pages. Production images should be
real photography of diverse salon types (hair, nail, spa, barbershop).

| File Pattern | Dimensions | Aspect Ratio |
|-------------|-----------|--------------|
| `salon-card-{1-6}-640w.svg` | 640×360 | 16:9 |

See `salons/README.md` for details on each card and production replacement specs.

---

## Marketing Feature Images (`/marketing/`)

SVG placeholders for the "How It Works" and feature showcase sections.

| File Pattern | Dimensions | Aspect Ratio |
|-------------|-----------|--------------|
| `feature-{name}-960w.svg` | 960×720 | 4:3 |

See `marketing/README.md` for details.

---

## Photography Direction

See `docs/design-research/photography-direction.md` for full editorial guidance on:
- NYC aesthetic (dramatic lighting, high contrast, confident subjects)
- Salon-specific subject matter
- Color grading approach
- Composition rules

See `docs/design-research/image-sourcing.md` for:
- Recommended free stock sources (Unsplash, Pexels, Pixabay)
- Curated search terms per image category
- File naming conventions
- Image processing pipeline commands
- Quality checklist for sourced images

---

## Alt Text (Persian)

All images must have meaningful Persian alt text. Examples:
- Hero: `«فضای داخلی سالن زیبایی با نورپردازی حرفه‌ای»`
- Benefit (no-shows): `«سالن پر از مشتری بدون صندلی خالی»`
- Benefit (online booking): `«مشتری در حال رزرو آنلاین نوبت»`
- Benefit (calendar): `«صاحب سالن در حال مدیریت تقویم نوبت‌ها»`
- Salon cards: `«سالن زیبایی مدرن — نمای داخلی»`
- Marketing features: `«کشف بهترین سالن‌ها»`
