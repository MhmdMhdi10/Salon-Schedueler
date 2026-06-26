import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { SeoHead } from '../SeoHead';
import { JsonLd, normalizeJsonLdNode, serializeJsonLd } from '../JsonLd';
import { absoluteCanonical, SITE_URL, SITE_NAME } from '../config';

/**
 * Component + unit tests for the SEO foundation (`<SeoHead>`, `<JsonLd>`, and
 * the canonical helper). Verifies the noindex-by-default safety property, the
 * title template, single-host canonical with stripped params, OG/Twitter +
 * hreflang completeness, and validated structured-data injection.
 * Requirements: 8.2, 8.3, 8.6, 8.7
 */

/** Mount a tree inside HelmetProvider and wait for Helmet to flush to <head>. */
function renderWithHelmet(ui: React.ReactElement) {
  return render(<HelmetProvider>{ui}</HelmetProvider>);
}

function head(selector: string): Element | null {
  return document.head.querySelector(selector);
}

describe('absoluteCanonical', () => {
  it('joins a path onto the single site host', () => {
    expect(absoluteCanonical('/s/salon-rose')).toBe(`${SITE_URL}/s/salon-rose`);
  });

  it('collapses the root path to the bare host (no trailing slash)', () => {
    expect(absoluteCanonical('/')).toBe(SITE_URL);
  });

  it('strips query and hash (tracking params never leak)', () => {
    expect(absoluteCanonical('/s/salon-rose?utm_source=ig&gclid=x#gallery')).toBe(
      `${SITE_URL}/s/salon-rose`,
    );
  });

  it('adds a leading slash when missing', () => {
    expect(absoluteCanonical('about')).toBe(`${SITE_URL}/about`);
  });

  it('keeps an already-absolute URL but strips its params', () => {
    expect(absoluteCanonical('https://other.ir/x?a=1')).toBe('https://other.ir/x');
  });
});

describe('SeoHead', () => {
  it('defaults to noindex,follow so routes opt in to indexing (R8.7)', async () => {
    renderWithHelmet(<SeoHead title="صفحه خصوصی" path="/admin/config" />);
    await waitFor(() => {
      expect(head('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
    });
  });

  it('emits index,follow only when index is explicitly true', async () => {
    renderWithHelmet(<SeoHead title="خانه" path="/" index />);
    await waitFor(() => {
      expect(head('meta[name="robots"]')).toHaveAttribute('content', 'index,follow');
    });
  });

  it('applies the «{صفحه} | رزرو سالن» title template', async () => {
    renderWithHelmet(<SeoHead title="سالن رز" path="/s/salon-rose" index />);
    await waitFor(() => {
      expect(document.title).toBe(`سالن رز${' | '}${SITE_NAME}`);
    });
  });

  it('falls back to the bare site name when no title is given', async () => {
    renderWithHelmet(<SeoHead path="/" index />);
    await waitFor(() => {
      expect(document.title).toBe(SITE_NAME);
    });
  });

  it('writes an absolute canonical on the single host with params stripped', async () => {
    renderWithHelmet(
      <SeoHead title="سالن رز" path="/s/salon-rose?utm_source=x" index />,
    );
    await waitFor(() => {
      expect(head('link[rel="canonical"]')).toHaveAttribute(
        'href',
        `${SITE_URL}/s/salon-rose`,
      );
    });
  });

  it('emits the meta description on OG and Twitter as well', async () => {
    const desc = 'رزرو آنلاین نوبت کوتاهی، رنگ و میکاپ در سالن رز در ولنجک تهران.';
    renderWithHelmet(
      <SeoHead title="سالن رز" description={desc} path="/s/salon-rose" index />,
    );
    await waitFor(() => {
      expect(head('meta[name="description"]')).toHaveAttribute('content', desc);
      expect(head('meta[property="og:description"]')).toHaveAttribute('content', desc);
      expect(head('meta[name="twitter:description"]')).toHaveAttribute('content', desc);
    });
  });

  it('emits complete Open Graph + Twitter tags with fa_IR locale and a 1200×630 image', async () => {
    renderWithHelmet(<SeoHead title="خانه" path="/" index />);
    await waitFor(() => {
      expect(head('meta[property="og:locale"]')).toHaveAttribute('content', 'fa_IR');
      expect(head('meta[property="og:site_name"]')).toHaveAttribute('content', SITE_NAME);
      expect(head('meta[property="og:type"]')).toHaveAttribute('content', 'website');
      expect(head('meta[property="og:image:width"]')).toHaveAttribute('content', '1200');
      expect(head('meta[property="og:image:height"]')).toHaveAttribute('content', '630');
      expect(head('meta[name="twitter:card"]')).toHaveAttribute(
        'content',
        'summary_large_image',
      );
    });
  });

  it('declares hreflang self-reference (fa, fa-IR) and x-default → home', async () => {
    renderWithHelmet(<SeoHead title="سالن رز" path="/s/salon-rose" index />);
    await waitFor(() => {
      const alternates = Array.from(
        document.head.querySelectorAll('link[rel="alternate"]'),
      );
      const byLang = Object.fromEntries(
        alternates.map((el) => [el.getAttribute('hreflang'), el.getAttribute('href')]),
      );
      expect(byLang['fa']).toBe(`${SITE_URL}/s/salon-rose`);
      expect(byLang['fa-IR']).toBe(`${SITE_URL}/s/salon-rose`);
      expect(byLang['x-default']).toBe(SITE_URL);
    });
  });

  it('honors an explicit canonical override (normalized)', async () => {
    renderWithHelmet(
      <SeoHead title="خانه" path="/page/2" canonical="/page?ref=x" index />,
    );
    await waitFor(() => {
      expect(head('link[rel="canonical"]')).toHaveAttribute('href', `${SITE_URL}/page`);
    });
  });
});

describe('JsonLd validation helpers', () => {
  it('normalizes a node by filling the default @context', () => {
    expect(normalizeJsonLdNode({ '@type': 'WebSite', name: 'x' })).toEqual({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'x',
    });
  });

  it('rejects nodes without a usable @type', () => {
    expect(normalizeJsonLdNode({ name: 'x' })).toBeNull();
    expect(normalizeJsonLdNode({ '@type': '' })).toBeNull();
    expect(normalizeJsonLdNode(null)).toBeNull();
    expect(normalizeJsonLdNode([{ '@type': 'WebSite' }])).toBeNull();
  });

  it('escapes <, >, & so the payload cannot break out of <script>', () => {
    const serialized = serializeJsonLd({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: '</script><x>&',
    });
    expect(serialized).not.toContain('</script>');
    expect(serialized).not.toContain('<x>');
    expect(serialized).toContain('\\u003c');
    expect(serialized).toContain('\\u003e');
    expect(serialized).toContain('\\u0026');
  });
});

describe('JsonLd component', () => {
  it('injects a valid node as an application/ld+json script', async () => {
    renderWithHelmet(
      <JsonLd data={{ '@type': 'WebSite', name: SITE_NAME, url: SITE_URL }} />,
    );
    await waitFor(() => {
      const script = head('script[type="application/ld+json"]');
      expect(script).not.toBeNull();
      const parsed = JSON.parse(script!.textContent!);
      expect(parsed['@context']).toBe('https://schema.org');
      expect(parsed['@type']).toBe('WebSite');
      expect(parsed.name).toBe(SITE_NAME);
    });
  });

  it('emits one script per node for an array of nodes', async () => {
    renderWithHelmet(
      <JsonLd
        data={[
          { '@type': 'BeautySalon', name: 'سالن رز' },
          { '@type': 'BreadcrumbList', itemListElement: [] },
        ]}
      />,
    );
    await waitFor(() => {
      const scripts = document.head.querySelectorAll(
        'script[type="application/ld+json"]',
      );
      expect(scripts.length).toBe(2);
    });
  });

  it('drops invalid nodes and warns in dev', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderWithHelmet(
      <JsonLd
        data={[
          { '@type': 'WebSite', name: 'ok' },
          { name: 'missing-type' } as never,
        ]}
      />,
    );
    await waitFor(() => {
      const scripts = document.head.querySelectorAll(
        'script[type="application/ld+json"]',
      );
      expect(scripts.length).toBe(1);
    });
    warn.mockRestore();
  });
});
