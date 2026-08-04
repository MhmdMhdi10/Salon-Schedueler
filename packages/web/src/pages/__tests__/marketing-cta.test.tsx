import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import '../../i18n';
import { MarketingHome } from '../MarketingHome';
import { BusinessLanding } from '../BusinessLanding';

/**
 * Unit tests for hero CTA prominence and routing (task 12.5; R3.1, R3.6).
 *
 * Verifies (against the *visible* UI — no sr-only stand-ins):
 *  1. MarketingHome (/) has exactly ONE element with `data-cta="primary"` —
 *     the hero search submit button (search-as-hero, directive §b): visible,
 *     filled, and it submits the hero form to `/search`.
 *  2. The home secondary CTA is a quiet visible link into discovery
 *     (`/city/tehran`) — never competing with the primary.
 *  3. BusinessLanding (/business) has exactly ONE `data-cta="primary"` in the
 *     hero routing straight to `/business/register` with no interstitial.
 *  4. Primary CTAs are visually more prominent than secondary CTAs
 *     (filled `bg-primary` + `shadow-1` vs quiet/outlined styling).
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
      <MemoryRouter initialEntries={['/']}>
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

    it('primary CTA is the visible hero search submit button (search-as-hero)', () => {
      const { getByTestId } = renderHome();
      const root = getByTestId('marketing-home');
      const primaryCta = root.querySelector('[data-cta="primary"]');
      expect(primaryCta).not.toBeNull();
      // The search bar IS the hero: its submit button is the primary CTA.
      expect(primaryCta!.tagName.toLowerCase()).toBe('button');
      expect(primaryCta!.getAttribute('type')).toBe('submit');
      // It lives inside the hero search form (submits to /search?q=).
      const form = primaryCta!.closest('form');
      expect(form).not.toBeNull();
      expect(form!.getAttribute('role')).toBe('search');
      // Visible — NOT an sr-only stand-in for the test's sake.
      expect(primaryCta!.className).not.toContain('sr-only');
    });

    it('secondary CTA is a visible quiet link into discovery (/city/tehran)', () => {
      const { getByTestId } = renderHome();
      const root = getByTestId('marketing-home');
      const secondaryCta = root.querySelector('[data-cta="secondary"]');
      expect(secondaryCta).not.toBeNull();
      expect(secondaryCta!.tagName.toLowerCase()).toBe('a');
      expect(secondaryCta!.getAttribute('href')).toBe('/city/tehran');
      expect(secondaryCta!.className).not.toContain('sr-only');
    });

    it('primary CTA is visually more prominent than the secondary CTA', () => {
      const { getByTestId } = renderHome();
      const root = getByTestId('marketing-home');
      const primaryCta = root.querySelector('[data-cta="primary"]');
      const secondaryCta = root.querySelector('[data-cta="secondary"]');
      expect(primaryCta).not.toBeNull();
      expect(secondaryCta).not.toBeNull();

      // Primary: filled brand background, contrast text, elevation.
      expect(primaryCta!.classList.contains('bg-primary')).toBe(true);
      expect(primaryCta!.classList.contains('text-primary-contrast')).toBe(true);
      expect(primaryCta!.classList.contains('shadow-1')).toBe(true);

      // Secondary: quiet — no filled brand background, no contrast text.
      expect(secondaryCta!.classList.contains('bg-primary')).toBe(false);
      expect(secondaryCta!.classList.contains('text-primary-contrast')).toBe(false);
    });
  });

  describe('BusinessLanding (/)', () => {
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

    it('hero primary CTA is visually more prominent than the outlined secondary CTA', () => {
      const { getByTestId } = renderBusiness();
      const root = getByTestId('business-landing');
      const hero = root.querySelector('[data-hero]');
      expect(hero).not.toBeNull();
      const primaryCta = hero!.querySelector('[data-cta="primary"]');
      const secondaryCta = hero!.querySelector('[data-cta="secondary"]');
      expect(primaryCta).not.toBeNull();
      expect(secondaryCta).not.toBeNull();

      // Primary: filled brand background, contrast text, elevation.
      expect(primaryCta!.classList.contains('bg-primary')).toBe(true);
      expect(primaryCta!.classList.contains('text-primary-contrast')).toBe(true);
      expect(primaryCta!.classList.contains('shadow-1')).toBe(true);

      // Secondary: outlined-brand tier — no fill, no contrast text.
      expect(secondaryCta!.classList.contains('bg-primary')).toBe(false);
      expect(secondaryCta!.classList.contains('text-primary-contrast')).toBe(false);
      expect(secondaryCta!.classList.contains('text-primary')).toBe(true);
    });
  });
});
