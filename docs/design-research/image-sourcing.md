# Image Sourcing Guide — NYC Editorial Salon Photography

> **Purpose:** Practical sourcing guide for all placeholder and production imagery needed
> across the Salon Booking platform. Covers search terms, recommended sources, required
> dimensions, and naming conventions.
>
> **Relationship:** Supplements `photography-direction.md` (style guide) with actionable
> sourcing steps. Implements Task 8.2 from the Booksy + New York Redesign spec.
>
> **Date:** June 2025

---

## 1. Photography Direction Summary

All sourced images must match the **NYC editorial salon aesthetic**:

| Attribute | Direction |
|-----------|-----------|
| **Lighting** | High contrast, dramatic side-light, warm practicals (salon mirrors, ring lights) |
| **Subjects** | Confident, direct gaze or engaged with craft; diverse |
| **Environment** | Urban, textured, real — architectural character visible |
| **Color** | Slightly desaturated mids, punchy highlights/shadows, warm-leaning |
| **Composition** | Off-center subjects, shallow DOF aesthetic, negative space for text overlays |
| **Avoid** | Sterile white backgrounds, over-filtered skin, flat lighting, generic stock |

---

## 2. Recommended Free Sources

### Primary Sources (Commercial-use friendly)

| Source | License | Best For | URL |
|--------|---------|----------|-----|
| **Unsplash** | Unsplash License (free commercial use) | Hero images, salon interiors, editorial portraits | https://unsplash.com |
| **Pexels** | Pexels License (free commercial use) | Treatment close-ups, beauty lifestyle | https://pexels.com |
| **Pixabay** | Pixabay License (free commercial use) | Textures, supplemental backgrounds | https://pixabay.com |

### Curated Search Terms

#### Hero / Landing Page Backgrounds

```
Unsplash:
  "salon interior dark moody"
  "hair salon dramatic lighting"
  "beauty salon mirror warm light"
  "salon interior night neon"
  "hairdresser salon urban"

Pexels:
  "luxury salon interior"
  "beauty salon atmosphere"
  "salon styling station mirror"
```

#### Salon Discovery Cards (Thumbnails)

```
Unsplash:
  "salon interior modern"
  "beauty parlor stylish"
  "hair salon station"
  "nail salon interior"
  "spa treatment room"
  "barbershop urban"

Pexels:
  "salon reception"
  "beauty studio interior"
  "modern hair salon"
```

#### Treatment / Service Images

```
Unsplash:
  "hair coloring process"
  "hairstylist cutting"
  "nail art hands"
  "facial treatment"
  "blow dry styling"

Pexels:
  "hair color foils"
  "scissors cutting hair"
  "manicure close up"
  "skincare application"
```

#### Marketing / Feature Sections

```
Unsplash:
  "woman phone booking appointment"
  "tablet calendar schedule"
  "busy salon clients"
  "salon owner professional"

Pexels:
  "online booking phone"
  "business owner tablet"
  "hair salon busy"
```

---

## 3. Required Assets by Usage Context

### 3.1 Landing Page Hero (ParallaxHero)

**Status:** ✅ Placeholder files exist at `frontend/public/images/hero-salon-interior-*`

| File | Dimensions | Format | Aspect Ratio |
|------|-----------|--------|--------------|
| `hero-salon-interior-640w.avif` | 640×360 | AVIF | 16:9 |
| `hero-salon-interior-960w.avif` | 960×540 | AVIF | 16:9 |
| `hero-salon-interior-1280w.avif` | 1280×720 | AVIF | 16:9 |
| `hero-salon-interior-1920w.avif` | 1920×1080 | AVIF | 16:9 |
| `hero-salon-interior-640w.webp` | 640×360 | WebP | 16:9 |
| `hero-salon-interior-1280w.webp` | 1280×720 | WebP | 16:9 |
| `hero-salon-interior-1280w.jpg` | 1280×720 | JPEG | 16:9 |

**Subject:** Stylish salon interior — wide angle showing mirrors, styling chairs, dramatic
warm lighting. Must have negative space (dark areas) for Persian headline overlay.

**Selection criteria:**
- Dark/moody areas on right side (RTL: text appears on the start/right)
- Warm color temperature (golds, warm whites)
- Architectural interest (exposed brick, industrial elements, designed fixtures)
- No recognizable faces that would need model releases

---

### 3.2 Salon Discovery Cards

**Status:** 🆕 Need to create

| File Pattern | Dimensions | Format | Aspect Ratio |
|-------------|-----------|--------|--------------|
| `salon-card-{n}-640w.avif` | 640×360 | AVIF | 16:9 |
| `salon-card-{n}-960w.avif` | 960×540 | AVIF | 16:9 |
| `salon-card-{n}-640w.webp` | 640×360 | WebP | 16:9 |

**Quantity needed:** 6–8 distinct images for placeholder salon cards on discovery pages.

**Subjects (vary across set):**
1. Modern salon interior — reception/waiting area
2. Styling station close-up — mirror, tools, warm lights
3. Nail salon — colorful, artistic stations
4. Hair coloring station — foils/products visible
5. Spa/treatment room — calm, designed
6. Salon exterior at dusk — signage, warm interior glow

**Selection criteria:**
- Each image should feel like a different salon
- Mix of hair salons, beauty/nail salons, spa-like environments
- Consistent editing style (warm, slightly desaturated mids, punchy contrast)
- No text/signage in non-Persian scripts prominently visible

---

### 3.3 Marketing / Feature Section Images

**Status:** ✅ Placeholder files exist at `frontend/public/images/benefit-*`

| File | Dimensions | Format | Aspect Ratio |
|------|-----------|--------|--------------|
| `benefit-no-shows-960w.avif` | 960×720 | AVIF | 4:3 |
| `benefit-online-booking-960w.avif` | 960×720 | AVIF | 4:3 |
| `benefit-calendar-960w.avif` | 960×720 | AVIF | 4:3 |

---

### 3.4 Salon Profile Gallery (Carousel)

**Status:** 🆕 Need for profile pages

| File Pattern | Dimensions | Format | Aspect Ratio |
|-------------|-----------|--------|--------------|
| `gallery-{category}-{n}-960w.avif` | 960×720 | AVIF | 4:3 |
| `gallery-{category}-{n}-640w.avif` | 640×480 | AVIF | 4:3 |

**Categories:**
- `interior` — salon environment shots
- `treatment` — services being performed
- `result` — styled outcomes (hair, nails, etc.)

---

### 3.5 Staff Portraits (Placeholder)

**Status:** Handled by `SalonPlaceholder.tsx` component (brand motif)

No photography needed — the `SalonPlaceholder` component generates branded placeholders
with the Motif pattern when staff haven't uploaded portraits.

---

## 4. File Naming Convention

```
{context}-{descriptor}-{width}w.{format}

Context prefixes:
  hero-       Landing page hero backgrounds
  salon-card- Discovery card thumbnails
  benefit-    Marketing feature section images
  gallery-    Salon profile carousel images
  portrait-   Staff portraits
  result-     Portfolio/before-after
  og-         Open Graph social images

Descriptors:
  Use hyphenated-lowercase English describing the subject
  Examples: salon-interior, hair-coloring, nail-art, reception-modern

Width suffixes:
  640w   — mobile
  960w   — tablet
  1280w  — desktop
  1920w  — wide/hero full-bleed

Formats:
  .avif  — primary (modern browsers)
  .webp  — fallback (Safari < 16)
  .jpg   — legacy fallback
  .png   — only for UI elements/icons that need transparency
```

### Examples

```
hero-salon-interior-1920w.avif
hero-salon-interior-1280w.webp
salon-card-modern-reception-640w.avif
salon-card-nail-studio-960w.avif
benefit-no-shows-960w.avif
gallery-treatment-hair-color-960w.avif
portrait-stylist-default-800w.webp
```

---

## 5. Image Processing Pipeline

### From Source to Production

```bash
# Prerequisites: sharp-cli or equivalent
npm install -g sharp-cli

# 1. Download source image (highest resolution available, min 2560px wide for hero)
# 2. Process through pipeline:

# Hero images (AVIF q50 for compression, WebP q75 fallback, JPEG q80 legacy)
sharp -i source.jpg -o hero-salon-interior-1920w.avif --format avif --quality 50 --width 1920 --height 1080 --fit cover
sharp -i source.jpg -o hero-salon-interior-1280w.avif --format avif --quality 50 --width 1280 --height 720 --fit cover
sharp -i source.jpg -o hero-salon-interior-960w.avif --format avif --quality 50 --width 960 --height 540 --fit cover
sharp -i source.jpg -o hero-salon-interior-640w.avif --format avif --quality 50 --width 640 --height 360 --fit cover
sharp -i source.jpg -o hero-salon-interior-1280w.webp --format webp --quality 75 --width 1280 --height 720 --fit cover
sharp -i source.jpg -o hero-salon-interior-640w.webp --format webp --quality 75 --width 640 --height 360 --fit cover
sharp -i source.jpg -o hero-salon-interior-1280w.jpg --format jpeg --quality 80 --width 1280 --height 720 --fit cover

# Card images (smaller, AVIF q55 for slight quality bump on smaller files)
sharp -i source.jpg -o salon-card-example-960w.avif --format avif --quality 55 --width 960 --height 540 --fit cover
sharp -i source.jpg -o salon-card-example-640w.avif --format avif --quality 55 --width 640 --height 360 --fit cover
sharp -i source.jpg -o salon-card-example-640w.webp --format webp --quality 75 --width 640 --height 360 --fit cover
```

### Automated Generation

Use the existing build script for dev placeholders:
```bash
node scripts/generate-placeholder-images.mjs
```

For production, integrate `sharp` into the build pipeline or use a Vite plugin:
- [`vite-imagetools`](https://github.com/JonasKruckenberg/imagetools) — query-based image transforms
- Or a custom script in `scripts/process-images.mjs`

---

## 6. Alt Text Reference (Persian)

Every image must have meaningful Persian alt text or be marked decorative.

| Context | Alt Text Pattern | Example |
|---------|-----------------|---------|
| Hero background | `«فضای داخلی سالن زیبایی با {ویژگی}»` | «فضای داخلی سالن زیبایی با نورپردازی دراماتیک» |
| Salon card | `«سالن زیبایی {name} — {descriptor}»` | «سالن زیبایی رز — نمای داخلی» |
| Treatment | `«{خدمت} در حال انجام»` | «رنگ‌آمیزی مو در حال انجام» |
| Benefit | `«{concept}»` | «مشتری در حال رزرو آنلاین نوبت» |
| Decorative | `alt=""` + `aria-hidden="true"` | — |

---

## 7. Quality Checklist for Sourced Images

Before adding any image to the project:

- [ ] License allows commercial use without attribution (Unsplash/Pexels license)
- [ ] Resolution sufficient for largest needed size (min 1920px wide for hero)
- [ ] Matches NYC editorial aesthetic (dramatic lighting, not flat/generic)
- [ ] No prominent text/signage in non-Persian scripts
- [ ] No recognizable faces requiring model releases (or verify model release exists)
- [ ] Skin tones rendered accurately (no distorting color grading)
- [ ] Composition has negative space appropriate for text overlay (hero images)
- [ ] Color temperature is warm-leaning (salon-appropriate)
- [ ] Image processed through AVIF/WebP/JPEG pipeline at all required sizes
- [ ] File size reasonable (< 200KB for AVIF hero, < 80KB for card thumbnails)
- [ ] Persian alt text written and documented

---

## 8. Existing Assets Inventory

### Already in Place (from prior tasks)

| Directory | Contents | Task |
|-----------|----------|------|
| `public/hero/` | Hero images (640w, 1280w in AVIF/WebP/PNG) | 3.7 |
| `public/images/hero-salon-interior-*` | Landing page hero (full srcset) | 3.7 |
| `public/images/benefit-*` | Owner benefits section (3 images) | 3.4 |
| `public/og/default.*` | Default OG image (AVIF/WebP/JPEG) | 9.4 |
| `public/icons/` | PWA icons | 9.1 |

### Still Needed for Production

| Category | Count | Priority | Blocker For |
|----------|-------|----------|-------------|
| Salon discovery card thumbnails | 6–8 | High | Task 8.3, 8.4 |
| Salon profile gallery samples | 4–6 | Medium | Profile page polish |
| Service category placeholders | 4–5 | Medium | Discovery filters |
| OG per-salon template | 1 template | Low | Task 9.4 |

---

## 9. Recommended Unsplash Photos (Curated References)

These searches yield results matching our aesthetic. When sourcing, look for photos by
photographers who specialize in interior/editorial salon work:

### Hero-Quality Images
- Search: `"salon interior" dramatic lighting` → look for wide-angle, warm-lit interiors
- Search: `"beauty salon" mirror` → styling stations with architectural interest
- Search: `"hair salon" moody` → high contrast, editorial feel

### Card-Quality Images
- Search: `"nail salon" modern` → colorful, designed nail studios
- Search: `"spa interior" luxury` → calm treatment rooms
- Search: `"barbershop" urban` → industrial, urban character

### Treatment Images
- Search: `"hair coloring" salon` → foils, bowls, process shots
- Search: `"hairstylist" working` → hands in action, tools visible
- Search: `"manicure" close up` → detail work, artistic

> **Note:** Always download the highest resolution available and process down. Never upscale.
