import { describe, it, expect } from 'vitest';
import { DISCOVERY_CATEGORIES, DISCOVERY_CITIES } from '../taxonomy';

/**
 * Canonical-taxonomy contract test (implementation contract §"Canonical
 * taxonomy"). Every nav/category-rail/city-grid link imports from
 * `data/taxonomy.ts`, and the discovery surface guarantees these exact slugs
 * resolve — so the slug sets below are a cross-agent API and must not drift.
 */

describe('DISCOVERY_CATEGORIES', () => {
  it('contains exactly the 8 contract categories, in order', () => {
    expect(DISCOVERY_CATEGORIES.map((c) => c.slug)).toEqual([
      'hair',
      'barber',
      'nails',
      'skin',
      'brows',
      'massage',
      'makeup',
      'spa',
    ]);
  });

  it('every category has a non-empty Persian label', () => {
    for (const { label } of DISCOVERY_CATEGORIES) {
      expect(label.trim().length).toBeGreaterThan(0);
      // Persian text, not a Latin placeholder.
      expect(label).toMatch(/[؀-ۿ]/);
    }
  });
});

describe('DISCOVERY_CITIES', () => {
  it('contains exactly the 20 contract cities, in order', () => {
    expect(DISCOVERY_CITIES.map((c) => c.slug)).toEqual([
      'tehran',
      'mashhad',
      'isfahan',
      'shiraz',
      'karaj',
      'tabriz',
      'qom',
      'ahvaz',
      'rasht',
      'urmia',
      'kerman',
      'yazd',
      'qazvin',
      'sari',
      'kish',
      'bandar-abbas',
      'hamedan',
      'gorgan',
      'kermanshah',
      'arak',
    ]);
  });

  it('slugs are clean ASCII path segments and names are Persian', () => {
    for (const { slug, name } of DISCOVERY_CITIES) {
      expect(slug).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(name).toMatch(/[؀-ۿ]/);
    }
  });
});
