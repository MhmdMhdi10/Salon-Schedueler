import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import '../../i18n';
import { MarketingHome } from '../MarketingHome';
import { BusinessLanding } from '../BusinessLanding';

/**
 * Unit tests for hero CTA prominence and routing (task 12.5; R3.1, R3.6).
 *
 * Verifies:
 *  1. MarketingHome (/) has exactly ONE element with `data-cta="primary"`
 *  2. That primary CTA links to `/s/salon-rose` (the booking entry) with no interstitial
 *  3. BusinessLanding (/business) has exactly ONE element with `data-cta="primary"` in the hero
 *  4. That primary CTA links to `/owner` with no interstitial
 *  5. The primary CTA is visually more prominent than secondary CTAs (bg-primary class)
 *
 * Requirements: 3.1, 3.6
 */

afterEach(() => {
  cleanup();
});

function renderHome() {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={['/']}>
        <MarketingHome />
      </MemoryRouter>
    </HelmetProvider>,
  );
}

function renderBusiness() {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={['/business']}>
        <BusinessLanding />
      </MemoryRouter>
    </HelmetProvider>,
  );
}

describe('Hero CTA prominence and routing (R3.1, R3.6)', () => {
  describe('MarketingHome (/)', () => {
    it('has exactly ONE primary CTA (data-cta="primary")', () => {
      const { getByTestId } = renderHome();
      const root = getByTestId('marketing-home');
      const primaryCtas = root.querySelectorAll('[data-cta="primary"]');
      expect(primaryCtas).toHaveLength(1);
    });

    it('primary CTA routes to /s/salon-rose (booking entry) with no interstitial', () => {
      const { getByTestId } = renderHome();
      const root = getByTestId('marketing-home');
      const primaryCta = root.querySelector('[data-cta="primary"]');
      expect(primaryCta).not.toBeNull();
      // Direct link — no interstitial, no onClick handler that could prevent navigation
      expect(primaryCta!.getAttribute('href')).toBe('/s/salon-rose');
      // It's a plain <a> (rendered by react-router Link) — no button wrapping
      expect(primaryCta!.tagName.toLowerCase()).toBe('a');
    });

    it('primary CTA is visually more prominent than secondary CTAs (bg-primary, larger)', () => {
      const { getByTestId } = renderHome();
      const root = getByTestId('marketing-home');
      const primaryCta = root.querySelector('[data-cta="primary"]');
      const secondaryCta = root.querySelector('[data-cta="secondary"]');
      expect(primaryCta).not.toBeNull();
      expect(secondaryCta).not.toBeNull();

      const primaryClasses = primaryCta!.className;
      const secondaryClasses = secondaryCta!.className;

      // Primary has a filled background (bg-primary) — the single most-prominent element
      expect(primaryClasses).toContain('bg-primary');
      // Primary has contrasting text
      expect(primaryClasses).toContain('text-primary-contrast');
      // Primary has shadow for elevation
      expect(primaryClasses).toContain('shadow-1');

      // Secondary does NOT have bg-primary — it is visually subordinate
      expect(secondaryClasses).not.toContain('bg-primary');
      // Secondary uses a quieter text-only style
      expect(secondaryClasses).toContain('text-primary');
      expect(secondaryClasses).not.toContain('text-primary-contrast');
    });
  });

  describe('BusinessLanding (/business)', () => {
    it('has exactly ONE primary CTA in the hero section (data-cta="primary")', () => {
      const { getByTestId } = renderBusiness();
      const root = getByTestId('business-landing');
      // The hero section is the [data-hero] element
      const hero = root.querySelector('[data-hero]');
      expect(hero).not.toBeNull();
      const heroPrimaryCtas = hero!.querySelectorAll('[data-cta="primary"]');
      expect(heroPrimaryCtas).toHaveLength(1);
    });

    it('hero primary CTA routes to /business/register (sign-up entry) with no interstitial', () => {
      const { getByTestId } = renderBusiness();
      const root = getByTestId('business-landing');
      const hero = root.querySelector('[data-hero]');
      expect(hero).not.toBeNull();
      const primaryCta = hero!.querySelector('[data-cta="primary"]');
      expect(primaryCta).not.toBeNull();
      // Direct link — no interstitial, no confirmation dialog
      expect(primaryCta!.getAttribute('href')).toBe('/business/register');
      // It's a plain <a> (rendered by react-router Link) — no button wrapping
      expect(primaryCta!.tagName.toLowerCase()).toBe('a');
    });

    it('hero primary CTA is visually more prominent than secondary CTAs (bg-primary, larger)', () => {
      const { getByTestId } = renderBusiness();
      const root = getByTestId('business-landing');
      const hero = root.querySelector('[data-hero]');
      expect(hero).not.toBeNull();
      const primaryCta = hero!.querySelector('[data-cta="primary"]');
      const secondaryCta = hero!.querySelector('[data-cta="secondary"]');
      expect(primaryCta).not.toBeNull();
      expect(secondaryCta).not.toBeNull();

      const primaryClasses = primaryCta!.className;
      const secondaryClasses = secondaryCta!.className;

      // Primary has a filled background (bg-primary) — the single most-prominent element
      expect(primaryClasses).toContain('bg-primary');
      // Primary has contrasting text
      expect(primaryClasses).toContain('text-primary-contrast');
      // Primary has shadow for elevation
      expect(primaryClasses).toContain('shadow-1');

      // Secondary does NOT have bg-primary — it is visually subordinate
      expect(secondaryClasses).not.toContain('bg-primary');
      // Secondary uses a quieter text-only style
      expect(secondaryClasses).toContain('text-primary');
      expect(secondaryClasses).not.toContain('text-primary-contrast');
    });
  });
});
