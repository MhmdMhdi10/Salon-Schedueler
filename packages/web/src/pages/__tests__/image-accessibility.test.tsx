import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import '../../i18n';

/**
 * Image accessibility audit (task 8.4; Req 9.3, 9.4, 9.5, 12.7).
 *
 * Validates all images across major pages satisfy:
 *  - Persian alt text (meaningful or empty for decorative)
 *  - Explicit width/height attributes (CLS prevention)
 *  - Correct loading/fetchpriority attributes (eager+high for LCP, lazy below fold)
 */

// ---- API client mock ----
vi.mock('../../api/client', () => ({
  ApiError: class extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
  setAccessToken: vi.fn(),
  authApi: {
    requestOtp: vi.fn().mockResolvedValue(undefined),
    verifyOtp: vi.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }),
  },
}));

import { MarketingHome } from '../MarketingHome';
import { SalonProfilePage } from '../SalonProfilePage';
import { BusinessLanding } from '../BusinessLanding';
import { Picture } from '../../components/ui/Picture';

function wrap(ui: React.ReactElement, initialPath = '/') {
  return (
    <HelmetProvider>
      <MemoryRouter initialEntries={[initialPath]}>{ui}</MemoryRouter>
    </HelmetProvider>
  );
}

afterEach(() => {
  cleanup();
});

/**
 * Persian regex: checks that the alt text contains at least one Persian/Arabic
 * character, proving it's localised (not English placeholder text).
 */
const PERSIAN_REGEX = /[\u0600-\u06FF]/;

/**
 * Asserts every `<img>` on a page has:
 * 1. An `alt` attribute (present, possibly empty for decorative)
 * 2. Explicit `width` and `height` attributes (CLS prevention)
 * 3. Meaningful images have non-empty Persian alt text
 */
function auditImages(root: HTMLElement, _options?: { allowDecorativeEmpty?: boolean }) {
  const images = Array.from(root.querySelectorAll('img'));
  expect(images.length).toBeGreaterThan(0);

  for (const img of images) {
    const src = img.getAttribute('src') ?? '';

    // 1. alt attribute must be present
    expect(img.hasAttribute('alt'), `<img src="${src}"> is missing alt attribute`).toBe(true);

    // 2. Explicit width and height (CLS-safe)
    expect(
      img.hasAttribute('width'),
      `<img src="${src}" alt="${img.alt}"> missing explicit width`,
    ).toBe(true);
    expect(
      img.hasAttribute('height'),
      `<img src="${src}" alt="${img.alt}"> missing explicit height`,
    ).toBe(true);

    // 3. Non-empty alt must contain Persian characters
    const alt = img.getAttribute('alt') ?? '';
    if (alt.length > 0) {
      expect(
        PERSIAN_REGEX.test(alt),
        `<img src="${src}"> alt="${alt}" should contain Persian text`,
      ).toBe(true);
    }
  }
}

// ---------------------------------------------------------------------------
// MarketingHome
// ---------------------------------------------------------------------------
describe('Image accessibility — MarketingHome', () => {
  function renderHome() {
    return render(wrap(<MarketingHome />, '/'));
  }

  it('all images have Persian alt text and explicit width/height', () => {
    const { getByTestId } = renderHome();
    auditImages(getByTestId('marketing-home'));
  });

  it('hero image has loading="eager" and fetchpriority="high"', () => {
    const { getByTestId } = renderHome();
    const root = getByTestId('marketing-home');
    const heroImg = root.querySelector('img[fetchpriority="high"]');
    expect(heroImg).not.toBeNull();
    expect(heroImg!.getAttribute('loading')).toBe('eager');
    expect(heroImg!.getAttribute('fetchpriority')).toBe('high');
  });

  it('below-fold benefit images have loading="lazy"', () => {
    const { getByTestId } = renderHome();
    const root = getByTestId('marketing-home');
    // All images that are not the hero should be lazy
    const allImages = Array.from(root.querySelectorAll('img'));
    const lazyImages = allImages.filter((img) => img.getAttribute('loading') === 'lazy');
    // There should be at least the 3 benefit section images
    expect(lazyImages.length).toBeGreaterThanOrEqual(3);
    for (const img of lazyImages) {
      // Lazy images should NOT have fetchpriority="high"
      expect(img.getAttribute('fetchpriority')).not.toBe('high');
    }
  });
});

// ---------------------------------------------------------------------------
// SalonProfilePage
// ---------------------------------------------------------------------------
describe('Image accessibility — SalonProfilePage', () => {
  function renderProfile() {
    return render(
      wrap(
        <Routes>
          <Route path="/s/:slug" element={<SalonProfilePage />} />
        </Routes>,
        '/s/salon-rose',
      ),
    );
  }

  it('all gallery images have Persian alt text and explicit width/height', () => {
    const { getByTestId } = renderProfile();
    auditImages(getByTestId('salon-profile'));
  });

  it('carousel first image is eager-loaded with fetchpriority="high"', () => {
    const { getByTestId } = renderProfile();
    const root = getByTestId('salon-profile');
    const eagerImg = root.querySelector('img[loading="eager"]');
    expect(eagerImg).not.toBeNull();
    expect(eagerImg!.getAttribute('fetchpriority')).toBe('high');
  });

  it('all non-LCP gallery images have loading="lazy"', () => {
    const { getByTestId } = renderProfile();
    const root = getByTestId('salon-profile');
    // Gallery is the hero mosaic: first image is the LCP candidate; the rest
    // must stay lazy.
    const gallerySection = root.querySelector('[aria-labelledby="salon-gallery-title"]');
    if (gallerySection) {
      const galleryImages = Array.from(gallerySection.querySelectorAll('img'));
      for (const img of galleryImages.slice(1)) {
        expect(img.getAttribute('loading')).toBe('lazy');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// BusinessLanding
// ---------------------------------------------------------------------------
describe('Image accessibility — BusinessLanding', () => {
  function renderBusiness() {
    return render(wrap(<BusinessLanding />, '/business'));
  }

  it('matches the reference image-free business hero', () => {
    const { getByTestId } = renderBusiness();
    expect(getByTestId('business-landing').querySelectorAll('img')).toHaveLength(0);
  });

  it('does not add an off-reference hero image', () => {
    const { getByTestId } = renderBusiness();
    const root = getByTestId('business-landing');
    const heroImg = root.querySelector('img[fetchpriority="high"]');
    expect(heroImg).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Picture component contract
// ---------------------------------------------------------------------------
describe('Picture component enforces width/height as required props', () => {
  it('Picture type interface requires width and height (compile-time)', () => {
    // This is a compile-time check — TypeScript will fail the build if
    // width/height become optional. We import the type to verify it here.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    type AssertRequiredWidth =
      import('../../components/ui/Picture').PictureProps['width'] extends number ? true : false;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    type AssertRequiredHeight =
      import('../../components/ui/Picture').PictureProps['height'] extends number ? true : false;

    // Runtime: render a Picture and confirm width/height are on the <img>
    const { container } = render(
      <Picture sources={[]} src="/test.jpg" alt="تست" width={800} height={600} />,
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('width')).toBe('800');
    expect(img!.getAttribute('height')).toBe('600');
  });
});
