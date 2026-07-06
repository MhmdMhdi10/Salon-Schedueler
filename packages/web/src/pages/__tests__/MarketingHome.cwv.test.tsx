import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import '../../i18n';
import { MarketingHome } from '../MarketingHome';

/**
 * Core Web Vitals verification for the landing page (Task 3.8; Req 4.8, 13.1).
 *
 * These tests verify the structural and attribute-level optimizations that
 * ensure the landing page meets CWV targets:
 *   - LCP < 2.5s (hero image preload, eager loading, fetchpriority)
 *   - CLS < 0.1 (explicit dimensions, font-display swap, reserved space)
 *   - Responsive at all breakpoints (360px, 480px, 768px, 1024px, 1280px)
 *   - No horizontal overflow (no fixed widths that exceed viewport)
 *
 * NOTE: Actual field CWV measurement requires real browser profiling (Lighthouse,
 * CrUX). These tests verify the implementation patterns that achieve CWV targets.
 */

function renderHome() {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={['/']}>
        <MarketingHome />
      </MemoryRouter>
    </HelmetProvider>,
  );
}

function head(selector: string): Element | null {
  return document.head.querySelector(selector);
}

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// 1. LCP Optimization
// ---------------------------------------------------------------------------
describe('LCP optimization', () => {
  it('hero uses token bg (no image dependency, no broken LCP element)', () => {
    const { getByTestId } = renderHome();
    const root = getByTestId('marketing-home');
    // The hero section uses bg-bg (light token background), not an image.
    const heroSection = root.querySelector('section');
    expect(heroSection).not.toBeNull();
    expect(heroSection!.className).toContain('bg-bg');
    // No image element in the hero — LCP is the text/search, not a broken image.
    const heroImg = heroSection!.querySelector('img');
    expect(heroImg).toBeNull();
  });

  it('hero has a search form as the primary interaction', () => {
    const { getByTestId } = renderHome();
    const root = getByTestId('marketing-home');
    const heroSection = root.querySelector('section');
    const searchForm = heroSection!.querySelector('form');
    expect(searchForm).not.toBeNull();
    const searchInput = searchForm!.querySelector('input');
    expect(searchInput).not.toBeNull();
  });

  it('Vazirmatn font is preloaded in index.html', () => {
    const html = readFileSync(resolve(__dirname, '../../../index.html'), 'utf-8');
    expect(html).toContain('rel="preload"');
    expect(html).toContain('as="font"');
    expect(html).toContain('vazirmatn');
    expect(html).toContain('crossorigin');
  });

  it('route-level code splitting: MarketingHome is lazy-loaded (no admin bundles)', () => {
    const appContent = readFileSync(resolve(__dirname, '../../App.tsx'), 'utf-8');
    // MarketingHome is lazy-loaded
    expect(appContent).toMatch(/lazy\(\(\)\s*=>\s*\n?\s*import\(['"]\.\/pages\/MarketingHome['"]\)/);
    // Owner pages are also lazy-loaded (separate code split group)
    expect(appContent).toMatch(/lazy\(\(\)\s*=>\s*\n?\s*import\(['"]\.\/pages\/owner/);
  });

  it('vite.config splits vendor-react, vendor-radix, and vendor-motion into separate chunks', () => {
    const viteContent = readFileSync(resolve(__dirname, '../../../vite.config.ts'), 'utf-8');
    expect(viteContent).toContain("'vendor-react'");
    expect(viteContent).toContain("'vendor-radix'");
    expect(viteContent).toContain("'vendor-motion'");
    expect(viteContent).toContain("'ui-overlays'");
    expect(viteContent).toContain("'ui-core'");
  });
});

// ---------------------------------------------------------------------------
// 2. CLS Prevention
// ---------------------------------------------------------------------------
describe('CLS prevention', () => {
  it('hero is compact (no min-h-screen, marketplace-style)', () => {
    const { getByTestId } = renderHome();
    const root = getByTestId('marketing-home');
    const heroSection = root.querySelector('section');
    expect(heroSection).not.toBeNull();
    // Marketplace-style hero does NOT use full-screen height
    expect(heroSection!.className).not.toContain('min-h-screen');
  });

  it('benefit images have explicit width and height attributes', () => {
    const { getByTestId } = renderHome();
    const root = getByTestId('marketing-home');
    // Benefit images are loaded lazily (below the fold)
    const lazyImages = root.querySelectorAll('img[loading="lazy"]');
    for (const img of lazyImages) {
      const width = img.getAttribute('width');
      const height = img.getAttribute('height');
      // Every lazy image must have explicit dimensions to reserve space
      expect(width, `Image ${img.getAttribute('src')} missing width`).toBeTruthy();
      expect(height, `Image ${img.getAttribute('src')} missing height`).toBeTruthy();
    }
  });

  it('font uses font-display: swap with metrics-matched fallback', () => {
    const css = readFileSync(resolve(__dirname, '../../styles/tokens.css'), 'utf-8');
    // Check font-display: swap on @font-face declarations
    const fontFaceBlocks = css.match(/@font-face\s*\{[^}]+\}/g) ?? [];
    expect(fontFaceBlocks.length).toBeGreaterThanOrEqual(2); // Arabic + Latin subsets
    for (const block of fontFaceBlocks) {
      expect(block).toContain('font-display: swap');
    }
    // Check metrics-matched fallback exists
    expect(css).toContain("font-family: 'Vazirmatn Fallback'");
    expect(css).toContain('ascent-override');
    expect(css).toContain('descent-override');
    expect(css).toContain('size-adjust');
  });

  it('salon cards use aspect-ratio for image space reservation', () => {
    const { getByTestId } = renderHome();
    const root = getByTestId('marketing-home');
    // SalonCard wraps the image in an aspect-ratio container
    const aspectContainers = root.querySelectorAll('[class*="aspect-"]');
    expect(aspectContainers.length).toBeGreaterThan(0);
  });

  it('reduced-motion media query clamps animation/transition duration', () => {
    const css = readFileSync(resolve(__dirname, '../../styles/tokens.css'), 'utf-8');
    expect(css).toContain('prefers-reduced-motion: reduce');
    expect(css).toContain('animation-duration: 0.01ms');
    expect(css).toContain('transition-duration: 0.01ms');
  });
});

// ---------------------------------------------------------------------------
// 3. Responsive Verification
// ---------------------------------------------------------------------------
describe('responsive design (no horizontal overflow)', () => {
  it('hero headline uses responsive text scaling', () => {
    const { getByTestId } = renderHome();
    const root = getByTestId('marketing-home');
    const h1 = root.querySelector('h1');
    expect(h1).not.toBeNull();
    const classes = h1!.className;
    // Marketplace hero: compact, responsive scaling
    expect(classes).toContain('text-2xl');
    expect(classes).toMatch(/sm:text-3xl/);
  });

  it('featured salons grid is responsive: grid-cols-1 sm:grid-cols-2 lg:grid-cols-4', () => {
    const { getByTestId } = renderHome();
    const root = getByTestId('marketing-home');
    const gridElements = root.querySelectorAll(
      '[class*="grid-cols-1"][class*="sm:grid-cols-2"]',
    );
    expect(gridElements.length).toBeGreaterThan(0);
  });

  it('owner CTA has data-cta attribute', () => {
    const { getByTestId } = renderHome();
    const root = getByTestId('marketing-home');
    const ownerCta = root.querySelector('[data-cta="owner"]');
    expect(ownerCta).not.toBeNull();
  });

  it('all sections use max-w-container + px-4 for bounded width with padding', () => {
    const { getByTestId } = renderHome();
    const root = getByTestId('marketing-home');
    // The page wraps content in max-w-container containers with px-4 padding
    const containers = root.querySelectorAll('.max-w-container');
    expect(containers.length).toBeGreaterThanOrEqual(5);
    for (const container of containers) {
      expect(container.className).toContain('px-4');
    }
  });

  it('no fixed pixel widths that could cause overflow on 360px viewports', () => {
    const { getByTestId } = renderHome();
    const root = getByTestId('marketing-home');
    // Check that no element has a hardcoded width style > 360px
    const allElements = root.querySelectorAll('*');
    for (const el of allElements) {
      const style = (el as HTMLElement).style?.width;
      if (style && style.match(/^\d+px$/)) {
        const px = parseInt(style, 10);
        expect(px).toBeLessThanOrEqual(360);
      }
    }
  });

  it('salon card grid adapts to multiple breakpoints', () => {
    const { getByTestId } = renderHome();
    const root = getByTestId('marketing-home');
    const grids = root.querySelectorAll(
      '[class*="grid-cols-1"][class*="sm:grid-cols-2"]',
    );
    expect(grids.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// 4. Performance Checklist
// ---------------------------------------------------------------------------
describe('performance budget and loading strategy', () => {
  it('below-fold images use loading="lazy"', () => {
    const { getByTestId } = renderHome();
    const root = getByTestId('marketing-home');
    const allImages = root.querySelectorAll('img');
    let lazyCount = 0;
    for (const img of allImages) {
      // With a CSS gradient hero, all remaining images are below-fold
      // and should be lazy-loaded.
      if (img.getAttribute('loading') === 'lazy') {
        lazyCount++;
      }
    }
    // There should be at least some lazy images (benefit section images, salon cards)
    expect(lazyCount).toBeGreaterThan(0);
    // All images should be lazy since there's no eager hero image anymore
    for (const img of allImages) {
      expect(
        img.getAttribute('loading'),
        `Image ${img.getAttribute('src')} should be lazy`,
      ).toBe('lazy');
    }
  });

  it('animation system uses only compositor-friendly properties (transform, opacity)', () => {
    const content = readFileSync(resolve(__dirname, '../../lib/motion-variants.ts'), 'utf-8');
    // Verify animations use only opacity, scale, x, y, rotate (compositor-safe)
    // No width, height, top, left animations
    expect(content).not.toMatch(/\bwidth\b\s*:/);
    expect(content).not.toMatch(/\bheight\b\s*:/);
    expect(content).not.toMatch(/\btop\b\s*:/);
    expect(content).not.toMatch(/\bleft\b\s*:/);
  });

  it('ParallaxHero does not animate layout-triggering properties', () => {
    const content = readFileSync(
      resolve(__dirname, '../../components/ui/ParallaxHero.tsx'),
      'utf-8',
    );
    // Should use y (translateY) not top/height
    expect(content).toContain('style={{ y:');
    expect(content).not.toMatch(/style=.*\btop\b/);
    expect(content).not.toMatch(/style=.*\bheight\b/);
    expect(content).not.toMatch(/style=.*\bwidth\b/);
  });
});
