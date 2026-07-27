import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getAllSalonProfiles, getSalonProfile, getSalonSlugs } from '../salons';
import { DISCOVERY_CITIES } from '../taxonomy';

/**
 * Data-invariant tests for the demo salon catalog. These lock in the two
 * cross-agent contracts:
 *
 *  1. §"Booking-data UUID contract" — `bookingSalonId` values must match the
 *     fixed UUID table that `docker/db/dev-seed.sql` seeds, or every «رزرو»
 *     CTA dead-ends in an empty booking funnel.
 *  2. §"Content honesty" — displayed ratings must be backed by on-page
 *     reviews (rating = average of reviews, reviewCount = reviews.length).
 */

/** The implementation contract's fixed UUID table — do not change. */
const UUID_CONTRACT: Record<string, string> = {
  'salon-rose': '11111111-1111-1111-1111-111111111111',
  'salon-maryam': 'aa000001-0000-4000-8000-000000000001',
  'shahin-barbershop': 'aa000002-0000-4000-8000-000000000002',
  'salon-niloofar': 'aa000003-0000-4000-8000-000000000003',
  'arash-studio': 'aa000004-0000-4000-8000-000000000004',
  'salon-parisa': 'aa000005-0000-4000-8000-000000000005',
};

const PUBLIC_DIR = join(__dirname, '..', '..', '..', 'public');

describe('booking UUID contract', () => {
  it('every profile maps to its contract UUID exactly', () => {
    expect(Object.keys(UUID_CONTRACT).sort()).toEqual(getSalonSlugs().sort());
    for (const [slug, uuid] of Object.entries(UUID_CONTRACT)) {
      expect(getSalonProfile(slug)?.bookingSalonId).toBe(uuid);
    }
  });
});

describe('content honesty — ratings backed by reviews', () => {
  it('rating equals the average of on-page reviews (1 decimal) and count matches', () => {
    for (const salon of getAllSalonProfiles()) {
      const reviews = salon.reviews ?? [];
      if (reviews.length === 0) {
        expect(salon.rating).toBeUndefined();
        expect(salon.reviewCount).toBeUndefined();
        continue;
      }
      const average = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
      expect(salon.rating).toBeCloseTo(Math.round(average * 10) / 10, 5);
      expect(salon.reviewCount).toBe(reviews.length);
    }
  });

  it('every review carries an author, body, valid rating, and ISO date', () => {
    for (const salon of getAllSalonProfiles()) {
      for (const review of salon.reviews ?? []) {
        expect(review.author.trim().length).toBeGreaterThan(0);
        expect(review.body.trim().length).toBeGreaterThan(0);
        expect(review.rating).toBeGreaterThanOrEqual(1);
        expect(review.rating).toBeLessThanOrEqual(5);
        expect(review.date).toMatch(/^\d{4}-\d{2}-\d{2}/);
      }
    }
  });
});

describe('profile completeness', () => {
  it('every profile has a gallery of shipped assets with Persian alt + dimensions', () => {
    for (const salon of getAllSalonProfiles()) {
      expect(salon.gallery.length).toBeGreaterThanOrEqual(3);
      for (const image of salon.gallery) {
        expect(image.alt.trim().length).toBeGreaterThan(0);
        expect(image.width).toBeGreaterThan(0);
        expect(image.height).toBeGreaterThan(0);
        // The asset actually ships under public/ — nothing 404s at runtime.
        expect(existsSync(join(PUBLIC_DIR, image.src)), `missing asset ${image.src}`).toBe(true);
      }
    }
  });

  it('every profile belongs to a canonical taxonomy city', () => {
    const citySlugs = new Set(DISCOVERY_CITIES.map((c) => c.slug));
    for (const salon of getAllSalonProfiles()) {
      expect(citySlugs.has(salon.citySlug), `unknown city ${salon.citySlug}`).toBe(true);
    }
  });

  it('every profile has services, staff, amenities, and booking policies', () => {
    for (const salon of getAllSalonProfiles()) {
      expect(salon.services.length).toBeGreaterThan(0);
      expect(salon.staff?.length ?? 0).toBeGreaterThan(0);
      expect(salon.amenities?.length ?? 0).toBeGreaterThan(0);
      expect(salon.policies?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('amenity lists are differentiated per salon — no templated duplicates', () => {
    const signatures = getAllSalonProfiles().map((salon) =>
      (salon.amenities ?? []).join('|'),
    );
    expect(new Set(signatures).size).toBe(signatures.length);
  });
});
