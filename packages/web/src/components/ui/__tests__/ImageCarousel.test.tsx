import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ImageCarousel, type CarouselImage } from '../ImageCarousel';
import { renderRtl, expectNoSeriousA11yViolations } from '../../../test/a11y';

/**
 * Component tests for ImageCarousel.
 * Covers ARIA carousel pattern, keyboard navigation, RTL arrow mirroring,
 * image loading strategy (eager first, lazy rest), navigation dots, and a11y.
 * Requirements: 6.1, 9.3, 9.4, 12.3
 */

// Mock framer-motion's useReducedMotion to control reduced motion behavior
vi.mock('framer-motion', async () => {
  const actual = await vi.importActual('framer-motion');
  return {
    ...actual,
    useReducedMotion: () => false,
  };
});

const sampleImages: CarouselImage[] = [
  { src: '/img/salon-1.avif', alt: 'نمای داخلی سالن', width: 1280, height: 720 },
  { src: '/img/salon-2.avif', alt: 'نمونه کار رنگ مو', width: 1280, height: 720 },
  { src: '/img/salon-3.avif', alt: 'فضای انتظار سالن', width: 1280, height: 720 },
];

describe('ImageCarousel', () => {
  beforeEach(() => {
    // Mock offsetWidth for container measurement
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      get: () => 800,
    });
  });

  it('renders nothing when images array is empty', () => {
    const { container } = render(<ImageCarousel images={[]} />);
    expect(container.querySelector('[role="region"]')).not.toBeInTheDocument();
  });

  it('renders the carousel region with correct ARIA attributes', () => {
    render(<ImageCarousel images={sampleImages} />);
    const region = screen.getByRole('region');
    expect(region).toHaveAttribute('aria-roledescription', 'carousel');
    expect(region).toHaveAttribute('aria-label', 'گالری تصاویر');
  });

  it('renders all slides with aria-roledescription="slide"', () => {
    const { container } = render(<ImageCarousel images={sampleImages} />);
    // aria-hidden slides are excluded from the accessibility tree by getAllByRole,
    // so query the DOM directly for slide elements
    const slides = container.querySelectorAll('[aria-roledescription="slide"]');
    expect(slides).toHaveLength(3);
    // The first slide (current) should not be hidden
    expect(slides[0]).toHaveAttribute('aria-hidden', 'false');
    // Non-current slides should be hidden
    expect(slides[1]).toHaveAttribute('aria-hidden', 'true');
    expect(slides[2]).toHaveAttribute('aria-hidden', 'true');
  });

  it('first image is eager-loaded with fetchpriority="high" by default', () => {
    render(<ImageCarousel images={sampleImages} />);
    const images = screen.getAllByRole('img');
    expect(images[0]).toHaveAttribute('loading', 'eager');
    expect(images[0]).toHaveAttribute('fetchpriority', 'high');
  });

  it('subsequent images are lazy-loaded', () => {
    const { container } = render(<ImageCarousel images={sampleImages} />);
    const images = container.querySelectorAll('img');
    expect(images[1]).toHaveAttribute('loading', 'lazy');
    expect(images[2]).toHaveAttribute('loading', 'lazy');
  });

  it('respects eagerFirst=false — all images lazy', () => {
    render(<ImageCarousel images={sampleImages} eagerFirst={false} />);
    const images = screen.getAllByRole('img');
    images.forEach((img) => {
      expect(img).toHaveAttribute('loading', 'lazy');
    });
  });

  it('all images have explicit width and height for CLS prevention', () => {
    render(<ImageCarousel images={sampleImages} />);
    const images = screen.getAllByRole('img');
    images.forEach((img) => {
      expect(img).toHaveAttribute('width', '1280');
      expect(img).toHaveAttribute('height', '720');
    });
  });

  it('renders navigation dots as tabs when multiple images', () => {
    render(<ImageCarousel images={sampleImages} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
  });

  it('clicking a dot navigates to that slide', () => {
    render(<ImageCarousel images={sampleImages} />);
    const tabs = screen.getAllByRole('tab');
    fireEvent.click(tabs[2]);
    expect(tabs[2]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'false');
  });

  it('does not render arrows or dots for a single image', () => {
    render(<ImageCarousel images={[sampleImages[0]]} />);
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('تصویر قبلی')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('تصویر بعدی')).not.toBeInTheDocument();
  });

  it('prev arrow is disabled on first slide', () => {
    render(<ImageCarousel images={sampleImages} />);
    const prevBtn = screen.getByLabelText('تصویر قبلی');
    expect(prevBtn).toBeDisabled();
  });

  it('next arrow is disabled on last slide', () => {
    render(<ImageCarousel images={sampleImages} />);
    const nextBtn = screen.getByLabelText('تصویر بعدی');
    // Navigate to last slide
    fireEvent.click(nextBtn);
    fireEvent.click(nextBtn);
    expect(nextBtn).toBeDisabled();
  });

  describe('RTL keyboard navigation', () => {
    it('ArrowLeft moves to next slide in RTL', () => {
      // The component defaults to RTL (document.documentElement.dir)
      document.documentElement.dir = 'rtl';
      render(<ImageCarousel images={sampleImages} />);
      const carousel = screen.getByRole('region');
      fireEvent.keyDown(carousel, { key: 'ArrowLeft' });
      const tabs = screen.getAllByRole('tab');
      expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    });

    it('ArrowRight moves to previous slide in RTL', () => {
      document.documentElement.dir = 'rtl';
      render(<ImageCarousel images={sampleImages} />);
      const carousel = screen.getByRole('region');
      // Go to slide 2 first
      fireEvent.keyDown(carousel, { key: 'ArrowLeft' });
      // Then ArrowRight should go back
      fireEvent.keyDown(carousel, { key: 'ArrowRight' });
      const tabs = screen.getAllByRole('tab');
      expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    });
  });

  it('carousel is focusable via tabIndex', () => {
    render(<ImageCarousel images={sampleImages} />);
    const region = screen.getByRole('region');
    expect(region).toHaveAttribute('tabindex', '0');
  });

  it('applies custom className to root container', () => {
    render(<ImageCarousel images={sampleImages} className="h-96 rounded-lg" />);
    const region = screen.getByRole('region');
    expect(region.className).toContain('h-96');
    expect(region.className).toContain('rounded-lg');
  });

  it('has no serious/critical a11y violations', async () => {
    document.documentElement.dir = 'rtl';
    const { rtlContainer } = renderRtl(<ImageCarousel images={sampleImages} />);
    await expectNoSeriousA11yViolations(rtlContainer);
  });
});
