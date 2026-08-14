import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Picture } from '../Picture';
import { renderRtl, expectNoSeriousA11yViolations } from '../../../test/a11y';

/**
 * Component tests for the responsive `<picture>` primitive (task 11.2; R9.5,
 * R9.6). It must serve modern AVIF/WebP sources before the PNG/JPG fallback,
 * keep the explicit `width`/`height` on the `<img>` (CLS-safe), and pass
 * through loading/priority hints.
 *
 * Requirements: 9.5, 9.6, 10.4
 */
describe('Picture', () => {
  const sources = [
    { type: 'image/avif', srcSet: '/hero/hero-640.avif 640w, /hero/hero-1280.avif 1280w' },
    { type: 'image/webp', srcSet: '/hero/hero-640.webp 640w, /hero/hero-1280.webp 1280w' },
  ];

  function renderHero(extra?: Record<string, unknown>) {
    return render(
      <Picture
        sources={sources}
        src="/hero/hero-1280.png"
        fallbackSrcSet="/hero/hero-640.png 640w, /hero/hero-1280.png 1280w"
        sizes="(min-width: 768px) 50vw, 100vw"
        width={1280}
        height={720}
        alt="نمای داخلی سالن"
        {...extra}
      />,
    );
  }

  it('emits AVIF and WebP <source>s ordered most-compressed first (R9.5)', () => {
    const { container } = renderHero();
    const picture = container.querySelector('picture')!;
    const types = Array.from(picture.querySelectorAll('source')).map((s) => s.getAttribute('type'));
    expect(types).toEqual(['image/avif', 'image/webp']);
  });

  it('passes the responsive srcSet to each modern source', () => {
    const { container } = renderHero();
    const avif = container.querySelector('source[type="image/avif"]')!;
    const webp = container.querySelector('source[type="image/webp"]')!;
    expect(avif.getAttribute('srcset')).toContain('hero-1280.avif 1280w');
    expect(webp.getAttribute('srcset')).toContain('hero-640.webp 640w');
  });

  it('renders a PNG/JPG fallback <img> with explicit width/height (CLS-safe; R9.6)', () => {
    renderHero();
    const img = screen.getByRole('img', { name: 'نمای داخلی سالن' });
    expect(img).toHaveAttribute('src', '/hero/hero-1280.png');
    expect(img.getAttribute('srcset')).toContain('hero-1280.png 1280w');
    expect(img).toHaveAttribute('width', '1280');
    expect(img).toHaveAttribute('height', '720');
    expect(img).toHaveAttribute('decoding', 'async');
  });

  it('passes through loading + fetchpriority hints for LCP/lazy use', () => {
    renderHero({ loading: 'eager', fetchpriority: 'high' });
    const img = screen.getByRole('img', { name: 'نمای داخلی سالن' });
    expect(img).toHaveAttribute('loading', 'eager');
    expect(img).toHaveAttribute('fetchpriority', 'high');
  });

  it('has no serious/critical a11y violations', async () => {
    const { rtlContainer } = renderRtl(
      <Picture
        sources={sources}
        src="/hero/hero-1280.png"
        width={1280}
        height={720}
        alt="نمای داخلی سالن"
      />,
    );
    await expectNoSeriousA11yViolations(rtlContainer);
  });
});
