# Photography & Imagery Direction — NYC Editorial Salon Aesthetic

> **Purpose:** Establishes the visual style, technical specifications, and sourcing strategy for all photography used across the Salon Booking platform.
>
> **Relationship:** Implements Requirement 9 (Photography and Visual Content Strategy) from the Booksy + New York Redesign spec. Informed by Section 7 of the Booksy analysis and Section 9 of the design document.
>
> **Date:** June 2025

---

## 1. Photography Style Guide

### Mood & Atmosphere

The photography direction draws from **New York City editorial beauty magazines** — think Vogue Beauty pages shot in a SoHo loft, or a Williamsburg salon profile in Paper Magazine. The images should feel:

- **Confident and direct** — subjects look at camera or engage purposefully with their craft
- **Urban and textured** — environments are real, lived-in, with architectural character
- **Dramatic but not dark** — high contrast with intention, not underexposed
- **Aspirational but authentic** — premium without being unattainable

### Lighting Direction

| Approach | Description | Usage |
|----------|-------------|-------|
| **Dramatic side-light** | Strong directional light creating defined shadows on faces and surfaces | Hero images, staff portraits |
| **Warm practical lighting** | Salon mirrors with bulbs, ring lights, neon reflections as visible sources | Interior shots, atmospheric backgrounds |
| **High-contrast natural** | Window light in harsh slants, creating pools of light and shadow | Treatment-in-progress shots |
| **Neon glow** | Colored light spill from signage or strip lighting (magenta, warm white) | Dark-theme hero imagery, night shots |

### Composition Principles

- **Off-center subjects** — use the rule of thirds; avoid centered, passport-style framing
- **Environmental context** — show the salon environment around the subject (mirrors, tools, architecture)
- **Shallow depth of field** — isolate subjects from backgrounds for editorial feel (f/1.8–f/2.8 aesthetic)
- **Tight crops on hands/detail** — beauty is in the work: hands styling hair, brush touching skin, scissors in motion
- **Leading lines** — use mirror reflections, countertop angles, and architectural lines to guide the eye
- **Negative space for text** — hero images must have areas of low visual complexity for headline overlays

### Color Treatment

| Aspect | Direction |
|--------|-----------|
| **Overall tone** | Slightly desaturated midtones, punchy highlights/shadows (not Instagram-filtered) |
| **Color temperature** | Warm-leaning (salon lighting is inherently warm) but not orange-cast |
| **Skin tones** | Accurate and respectful — no heavy color grading that distorts skin |
| **Accent colors in scene** | Allow natural salon colors (gold fixtures, warm wood, magenta/pink accents) to come through |
| **Black & white option** | Select hero images work well converted to high-contrast B&W for special treatments |

### What to Avoid

- Generic stock photography with sterile white backgrounds
- Over-filtered or heavily smoothed skin
- Overly bright, flat lighting (standard beauty ecommerce look)
- Clipart-style illustrations for anything photography can cover
- Men's barbershop aesthetic for the primary brand imagery (this is salon/beauty focused)
- Any imagery that feels corporate, clinical, or medical

---

## 2. Subject Categories

### 2.1 Hero Backgrounds (Landing Page, Section Dividers)

**Purpose:** Full-viewport backgrounds with text overlay capability.

| Requirements | Details |
|-------------|---------|
| Aspect ratio | 16:9 minimum, 21:9 preferred for cinematic feel |
| Composition | Strong negative space on one side/bottom for Persian RTL headline |
| Subject matter | Salon interior atmosphere, styling in progress (wide shot), salon exterior at night |
| Mood | Dramatic, atmospheric, urban |
| Overlay compatibility | Must work with dark gradient scrim (from-bg/80 to-transparent) |

**Shot list:**
1. NYC-style salon interior — wide angle, mirrors + warm lighting + styling chairs visible
2. Stylist working on client — dramatic side-light, environmental framing
3. Salon exterior at dusk/night — neon signage glow, urban street context
4. Close-up textural detail — hairbrush on counter, product bottles with bokeh background

### 2.2 Salon Interiors

**Purpose:** Discovery cards, salon profile galleries, marketing sections.

| Requirements | Details |
|-------------|---------|
| Aspect ratio | 16:9 for cards, 4:3 for gallery |
| Composition | Show space character — not just equipment, but atmosphere |
| Subject matter | Styling stations, waiting areas, product walls, architectural details |
| Mood | Inviting, trendy, aspirational |

**Shot list:**
1. Styling station with mirror — warm lighting, tools arranged, character visible in reflection
2. Modern reception/waiting area — minimal, designed, inviting
3. Product display wall — organized, colorful, well-lit
4. Architectural details — exposed brick, custom tilework, interesting ceiling/fixtures

### 2.3 Treatments in Progress

**Purpose:** Service cards, profile galleries, marketing content.

| Requirements | Details |
|-------------|---------|
| Aspect ratio | 4:3 or 1:1 (square) |
| Composition | Focus on hands + craft, environmental context |
| Subject matter | Hair coloring, cutting, styling, nail work, skincare, blowouts |
| Mood | Skilled, professional, engaging |

**Shot list:**
1. Hair coloring — foils or brush application, colorist's hands in frame
2. Hair cutting — scissors or razor in motion, hair falling
3. Blow-dry/styling — dramatic motion of hair, warm light catching movement
4. Nail art — close-up on hands, colorful detail work
5. Facial/skincare — serene application moment

### 2.4 Staff Portraits

**Purpose:** Team galleries, about sections, trust-building.

| Requirements | Details |
|-------------|---------|
| Aspect ratio | 3:4 (portrait) or 1:1 (square) |
| Composition | Environmental portrait — in their salon, not studio white |
| Subject matter | Individual stylists, owners, team groups |
| Mood | Confident, approachable, professional |

**Shot list:**
1. Stylist at their station — tools visible, arms crossed or hands on chair
2. Candid working shot — engaging with (blurred) client
3. Team group — casual, natural positioning, in salon space

### 2.5 Results & Portfolio

**Purpose:** Before/after displays, service showcase, social proof.

| Requirements | Details |
|-------------|---------|
| Aspect ratio | 1:1 (square) for consistency in grids |
| Composition | Clean, focused on the result — good lighting on the finished work |
| Subject matter | Styled hair results, nail art closeups, makeup looks |
| Mood | Polished, showcase-quality |

**Shot list:**
1. Finished hairstyle — good lighting, clean background, multiple angles
2. Color transformation — before/after pairing
3. Nail art gallery — clean hand positioning, solid or complementary backgrounds
4. Bridal/event styling — elevated, special-occasion results

---

## 3. Technical Specifications

### Image Formats & Delivery

| Format | Usage | Quality |
|--------|-------|---------|
| **AVIF** | Primary serving format (modern browsers) | q=65 for photography, q=50 for backgrounds |
| **WebP** | Fallback for Safari < 16, older browsers | q=75 |
| **JPEG** | Final fallback for legacy browsers | q=80 |

### Responsive Sizes (srcset)

| Breakpoint | Width | Usage |
|------------|-------|-------|
| Mobile | 640w | Single-column cards, mobile hero |
| Tablet | 960w | Two-column grid cards, tablet hero |
| Desktop | 1280w | Three-column cards, desktop hero |
| Wide | 1920w | Full-bleed hero backgrounds on wide screens |

### Aspect Ratios by Context

| Context | Ratio | CSS Implementation |
|---------|-------|-------------------|
| Hero backgrounds | 16:9 to 21:9 | `aspect-ratio: 16/9` + `object-fit: cover` |
| Salon cards (discovery) | 16:9 | `aspect-ratio: 16/9` |
| Gallery images | 4:3 | `aspect-ratio: 4/3` |
| Staff portraits | 3:4 | `aspect-ratio: 3/4` |
| Portfolio/results | 1:1 | `aspect-ratio: 1/1` |
| OG images | 1200×630 | Fixed dimensions |

### Resolution Requirements

| Usage | Minimum Resolution | Recommended |
|-------|-------------------|-------------|
| Hero (full-bleed) | 1920×1080 | 2560×1440 (for 2x displays) |
| Card images | 960×540 | 1280×720 |
| Thumbnails | 480×270 | 640×360 |
| Staff portraits | 600×800 | 800×1067 |
| OG social images | 1200×630 | 1200×630 (fixed) |

### Loading Strategy

```html
<!-- Hero/LCP image: eager load with preload -->
<link rel="preload" as="image" href="/images/hero-1280.avif" type="image/avif" />
<img
  src="/images/hero-1280.jpg"
  srcset="/images/hero-640.avif 640w, /images/hero-1280.avif 1280w, /images/hero-1920.avif 1920w"
  sizes="100vw"
  width="1920"
  height="1080"
  alt="فضای داخلی سالن زیبایی با نورپردازی دراماتیک"
  loading="eager"
  fetchpriority="high"
  decoding="async"
/>

<!-- Below-fold images: lazy load -->
<img
  src="/images/salon-card-640.jpg"
  srcset="/images/salon-card-640.avif 640w, /images/salon-card-960.avif 960w"
  sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
  width="960"
  height="540"
  alt="سالن زیبایی رز — نمای استایل"
  loading="lazy"
  decoding="async"
/>
```

### File Naming Convention

```
{context}-{descriptor}-{width}w.{format}

Examples:
hero-salon-interior-1920w.avif
hero-salon-interior-1280w.webp
hero-salon-interior-640w.jpg
card-hair-coloring-960w.avif
portrait-stylist-800w.webp
result-bridal-updo-640w.avif
```

---

## 4. Alt Text Guidelines (Persian)

### Principles

- Alt text is written in Persian (Farsi) matching the platform's primary language
- Describe **what the image shows**, not what it means in the UI context
- Be specific: mention the action, environment, or detail visible
- Keep between 5–20 words (Persian)
- Use natural Persian sentence fragments (not keyword-stuffed)

### Patterns by Category

| Category | Pattern | Example |
|----------|---------|---------|
| Hero background | «{محیط/فضا} با {ویژگی نوری/فضایی}» | «فضای داخلی سالن زیبایی با نورپردازی دراماتیک» |
| Treatment | «{عمل} توسط {فاعل}» or «{عمل} در حال انجام» | «رنگ‌آمیزی مو توسط آرایشگر حرفه‌ای» |
| Interior | «{فضا} — {جزئیات معماری/دکور}» | «ایستگاه آرایش با آینه و نورهای گرم» |
| Staff | «{نام یا عنوان} در {محل}» | «آرایشگر حرفه‌ای در سالن» |
| Result | «نمونه کار {نوع خدمت}» | «نمونه کار رنگ مو در سالن زیبایی» |
| Decorative | `alt=""` (empty) | Used for purely decorative backgrounds |

### Examples in Context

```tsx
// Hero image with meaningful alt
<img alt="فضای داخلی سالن زیبایی مدرن با دیوار آجری و نورهای نئونی" />

// Treatment card
<img alt="کوتاهی مو توسط آرایشگر — نمای نزدیک قیچی و موها" />

// Staff portrait
<img alt="سارا احمدی — متخصص رنگ مو" />

// Result/portfolio
<img alt="نمونه کار شینیون عروس با گل‌های طبیعی" />

// Decorative divider/texture
<img alt="" aria-hidden="true" />

// Brand motif placeholder
<img alt="" aria-hidden="true" /> // Decorative placeholder
```

### Generating Alt Text for Dynamic Content

For salon-uploaded images where alt text cannot be pre-written:

```tsx
// Pattern: generate alt from metadata
const altText = salon.heroImage.alt
  || t('salon.hero.alt', { name: salon.name })
  // Fallback: «تصویر سالن زیبایی {name}»

// For service images
const serviceAlt = t('service.image.alt', {
  service: service.name,
  salon: salon.name,
})
// Result: «نمونه کار {service} در {salon}»
```

---

## 5. Placeholder Strategy

### When Placeholders Are Needed

- Salon has not uploaded any photos yet
- Image fails to load (network error, CDN issue)
- Service has no associated imagery
- Staff member has no portrait

### Placeholder Hierarchy

```
1. Salon-specific default image (if salon uploaded at least one image, use it as fallback)
2. Category-specific placeholder (per service type: hair, nails, skincare, etc.)
3. Brand-styled generic placeholder (Motif pattern + signature palette)
```

### Brand Placeholder Design

```tsx
function SalonPlaceholder({ className, category }: Props) {
  return (
    <div className={cn(
      'relative flex items-center justify-center overflow-hidden',
      'bg-gradient-to-br from-surface to-border',
      className
    )}>
      {/* Subtle brand motif watermark */}
      <Motif
        variant="watermark"
        className="h-16 w-16 text-border opacity-30"
      />
      {/* Optional category icon */}
      {category && (
        <CategoryIcon
          category={category}
          className="absolute bottom-3 end-3 h-6 w-6 text-text-muted opacity-50"
        />
      )}
    </div>
  );
}
```

### Placeholder Specifications

| Context | Background | Content | Animation |
|---------|-----------|---------|-----------|
| Hero (loading) | `bg-surface` with shimmer animation | Brand motif at 30% opacity | CSS shimmer keyframe |
| Card (no image) | Gradient: `from-surface to-border` | Motif + category icon | None |
| Staff (no portrait) | `bg-surface` circle | Generic person icon | None |
| Gallery (loading) | `bg-surface` with aspect-ratio matched | Shimmer matching final size | CSS shimmer keyframe |
| Error state | `bg-surface` | Broken-image icon + retry text | None |

### Skeleton vs Placeholder

- **Skeleton**: shown while data is loading (temporary, animated shimmer)
- **Placeholder**: shown when image data doesn't exist (permanent, styled alternative)

---

## 6. Reference Sources & Inspiration

### Free Photography Sources

| Source | Best For | Search Keywords (English) |
|--------|----------|--------------------------|
| [Unsplash](https://unsplash.com) | High-quality salon interiors, beauty treatments | "salon interior dark", "hair styling editorial", "beauty salon moody", "hairdresser dramatic lighting" |
| [Pexels](https://pexels.com) | Treatment close-ups, lifestyle | "hair coloring process", "nail art close up", "salon atmosphere" |
| [Pixabay](https://pixabay.com) | Supplemental textures, backgrounds | "brick wall salon", "neon sign beauty", "mirror reflection salon" |

### Unsplash Collections to Reference

| Collection Theme | Keywords |
|-----------------|----------|
| NYC Salon Interiors | "salon interior", "barbershop", "beauty parlor new york", "hairdresser mirror" |
| Beauty in Progress | "hairstyling", "hair coloring", "beauty treatment", "nail art hands" |
| Urban Texture | "neon sign", "brick wall interior", "urban night glow", "moody interior" |
| Editorial Portraits | "portrait dramatic lighting", "beauty portrait", "confident woman portrait" |

### Stock Photography Keywords (for Shutterstock, Adobe Stock, Getty)

**Primary search terms:**
- "luxury salon interior dark moody"
- "hair stylist editorial portrait"
- "beauty salon dramatic lighting"
- "hairdresser at work side light"
- "salon chair mirror warm light"
- "nail artist close up hands"
- "modern barbershop interior urban"
- "hair coloring process dramatic"

**NYC-specific modifiers:**
- "new york salon"
- "urban beauty studio"
- "loft salon interior"
- "industrial chic salon"
- "brick wall beauty"

### Visual Mood Board References

| Reference | What to Take |
|-----------|-------------|
| Vogue Beauty editorials | Lighting direction, composition confidence, color grading |
| ELLE Salon features | Environmental portraits of stylists, workspace shots |
| Architectural Digest salon features | Interior composition, design-forward spaces |
| Instagram salon accounts (NYC-based) | Authentic atmosphere, real salon energy |
| Booksy provider profiles (top-rated) | How real salons photograph themselves |

### Specific Aesthetic References

**Lighting reference:** Annie Leibovitz-style environmental portraiture — subjects in their real space with dramatic but natural-feeling light.

**Composition reference:** The Gentlewoman magazine — editorial portraits that feel candid but are carefully composed, with environmental context.

**Color reference:** Kinfolk magazine aesthetic (desaturated mids) crossed with NYC neon energy (punchy highlights and accent colors).

**Interior reference:** NYC-based salons like Spoke & Weal, Suite Caroline, IGK Soho — modern, textured, designed spaces with character.

---

## 7. Implementation Checklist

### Image Pipeline Setup

- [ ] Configure Vite/build tool to process source images into AVIF + WebP + JPEG
- [ ] Set up responsive srcset generation at 640w, 960w, 1280w, 1920w breakpoints
- [ ] Create `<Picture>` component that handles format fallback and srcset
- [ ] Implement `<link rel="preload">` injection for hero/LCP images
- [ ] Add explicit `width` and `height` to all `<img>` elements to prevent CLS

### Content Creation

- [ ] Source/create 3-4 hero background images matching NYC editorial direction
- [ ] Source/create 6+ salon card images for discovery grid placeholders
- [ ] Source/create category-specific placeholder images (hair, nails, skincare, makeup)
- [ ] Create brand OG image (1200×630) with magenta gradient + Persian text
- [ ] Create salon-specific OG template (hero photo + brand overlay)

### Quality Assurance

- [ ] Verify all images have Persian alt text (or empty alt for decorative)
- [ ] Verify `loading="lazy"` on below-fold images, `loading="eager"` + `fetchpriority="high"` on hero
- [ ] Verify placeholder component renders correctly at all aspect ratios
- [ ] Verify images contribute to LCP < 2.5s target (hero image optimization)
- [ ] Verify no CLS from images (explicit dimensions + aspect-ratio CSS)
- [ ] Test dark scrim/gradient overlays for text legibility on all hero images (WCAG AA contrast)
