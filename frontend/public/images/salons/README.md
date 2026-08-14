# Salon Discovery Card Images

Development SVG placeholders for salon cards on discovery pages (`/city/:city`, `/services/:type`).

## For Production

Replace each SVG placeholder with real photography processed through the AVIF/WebP pipeline.
Each salon card needs images at these sizes:

| Width | Format | Usage |
|-------|--------|-------|
| 640w | AVIF | Mobile cards, default |
| 960w | AVIF | Tablet cards |
| 640w | WebP | Mobile fallback |

**Aspect ratio:** 16:9 (640×360, 960×540)

## Required Images (6 minimum)

| # | Subject | File Prefix | Alt Text (Persian) |
|---|---------|-------------|-------------------|
| 1 | Modern salon interior | `salon-card-1` | «سالن زیبایی مدرن — نمای داخلی» |
| 2 | Nail salon / art studio | `salon-card-2` | «سالن ناخن — استودیو هنری» |
| 3 | Spa / treatment room | `salon-card-3` | «اسپا و مرکز زیبایی — اتاق درمان» |
| 4 | Urban barbershop / styling | `salon-card-4` | «آرایشگاه شهری — ایستگاه استایل» |
| 5 | Hair color station | `salon-card-5` | «سالن رنگ مو — ایستگاه رنگ» |
| 6 | Salon exterior at night | `salon-card-6` | «سالن زیبایی — نمای شب بیرونی» |

## Photography Criteria

- NYC editorial feel: dramatic lighting, high contrast, confident
- Each image should represent a distinct type of salon
- Warm color temperature, slightly desaturated midtones
- No prominent non-Persian text/signage
- Suitable for use as card thumbnails (clear subject even at small sizes)

## Sourcing

See `docs/design-research/image-sourcing.md` for recommended sources and search terms.
See `docs/design-research/photography-direction.md` for full style guide.

## Processing

```bash
# From high-res source → card sizes
sharp -i source.jpg -o salon-card-N-960w.avif --format avif --quality 55 --width 960 --height 540 --fit cover
sharp -i source.jpg -o salon-card-N-640w.avif --format avif --quality 55 --width 640 --height 360 --fit cover
sharp -i source.jpg -o salon-card-N-640w.webp --format webp --quality 75 --width 640 --height 360 --fit cover
```
