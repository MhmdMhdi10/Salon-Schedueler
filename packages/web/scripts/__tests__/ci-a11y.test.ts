import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Contract tests for the automated-accessibility-in-CI wiring (task 10.3;
 * ui-ux §10 honesty note; seo §12 "Validation in CI"; R10.1, R10.4, R10.7).
 *
 * These pin the *configuration* that makes a11y a CI gate (the axe assertions
 * themselves are exercised by the component/page suites) and the documented
 * honesty note that automated checks are a floor, not a certificate — so the
 * R10.7 requirement to state this explicitly in the docs can't silently
 * regress.
 */

const webRoot = resolve(__dirname, '../..');
const repoRoot = resolve(webRoot, '../..');

function read(...segments: string[]): string {
  return readFileSync(resolve(repoRoot, ...segments), 'utf-8');
}

describe('Lighthouse a11y CI gate config (lighthouserc.json)', () => {
  const raw = read('packages/web/lighthouserc.json');
  const config = JSON.parse(raw) as {
    ci: {
      collect: { staticDistDir?: string; settings?: { onlyCategories?: string[] } };
      assert: { assertions: Record<string, unknown> };
    };
  };

  it('audits the prerendered public build output (staticDistDir ./dist)', () => {
    expect(config.ci.collect.staticDistDir).toBe('./dist');
  });

  it('scopes the audit to the accessibility category', () => {
    expect(config.ci.collect.settings?.onlyCategories).toContain('accessibility');
  });

  it('fails the build on an accessibility regression (error-level assertion)', () => {
    const assertion = config.ci.assert.assertions['categories:accessibility'];
    expect(Array.isArray(assertion)).toBe(true);
    expect((assertion as unknown[])[0]).toBe('error');
  });
});

describe('Lighthouse CWV gate config (lighthouserc.json, task 11.3, R9.4)', () => {
  const raw = read('packages/web/lighthouserc.json');
  const config = JSON.parse(raw) as {
    ci: {
      collect: { settings?: { emulatedFormFactor?: string; onlyCategories?: string[] } };
      assert: { assertions: Record<string, unknown> };
    };
  };

  function maxNumericValue(metric: string): number | undefined {
    const a = config.ci.assert.assertions[metric] as
      | [string, { maxNumericValue?: number }]
      | undefined;
    return a?.[1]?.maxNumericValue;
  }

  function assertionLevel(metric: string): string | undefined {
    const a = config.ci.assert.assertions[metric] as [string, unknown] | undefined;
    return a?.[0];
  }

  it('audits on a mid-range mobile profile', () => {
    expect(config.ci.collect.settings?.emulatedFormFactor).toBe('mobile');
  });

  it('also audits the performance category alongside accessibility', () => {
    expect(config.ci.collect.settings?.onlyCategories).toContain('performance');
  });

  it('gates LCP < 2.5s as a build error (seo §9 budget)', () => {
    expect(assertionLevel('largest-contentful-paint')).toBe('error');
    expect(maxNumericValue('largest-contentful-paint')).toBeLessThanOrEqual(2500);
  });

  it('gates CLS < 0.1 as a build error (seo §9 budget)', () => {
    expect(assertionLevel('cumulative-layout-shift')).toBe('error');
    expect(maxNumericValue('cumulative-layout-shift')).toBeLessThanOrEqual(0.1);
  });

  it('gates the lab INP proxy (total-blocking-time) < 200ms (field INP < 200ms)', () => {
    // INP is a field-only metric; TBT is its lab proxy. The field INP < 200ms
    // budget itself is observed via the web-vitals reporting (see below).
    expect(assertionLevel('total-blocking-time')).toBe('error');
    expect(maxNumericValue('total-blocking-time')).toBeLessThanOrEqual(200);
  });
});

describe('web-vitals field reporting wiring (task 11.3, seo §12, R9.4)', () => {
  it('declares web-vitals as a web-package dependency', () => {
    const pkg = JSON.parse(read('packages/web/package.json')) as {
      dependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.['web-vitals']).toBeTruthy();
  });

  it('registers consent-aware, PII-free reporting at startup in main.tsx', () => {
    const main = read('packages/web/src/main.tsx');
    expect(main).toMatch(/reportWebVitals/);
    expect(main).toMatch(/from '\.\/utils\/webVitals'/);
  });

  it('the reporting module observes all three Core Web Vitals (LCP/INP/CLS)', () => {
    const mod = read('packages/web/src/utils/webVitals.ts');
    expect(mod).toMatch(/onLCP/);
    expect(mod).toMatch(/onINP/);
    expect(mod).toMatch(/onCLS/);
  });
});

describe('CI workflow wires both a11y gates (.github/workflows/web-a11y.yml)', () => {
  const workflow = read('.github/workflows/web-a11y.yml');

  it('runs the axe-backed web test suite as a gate', () => {
    expect(workflow).toContain('npm run test --workspace @salon/web');
  });

  it('builds the public pages before auditing them', () => {
    expect(workflow).toContain('npm run build --workspace @salon/web');
  });

  it('runs the Lighthouse a11y gate against the lighthouserc config', () => {
    expect(workflow).toMatch(/lhci\/cli/);
    expect(workflow).toContain('packages/web/lighthouserc.json');
  });
});

describe('Accessibility honesty note (docs/accessibility.md, R10.7)', () => {
  const doc = read('packages/web/docs/accessibility.md');

  it('states the automated checks are a floor, not a certificate', () => {
    expect(doc).toMatch(/floor/i);
    expect(doc).toMatch(/not.*(sufficient|certificate)/i);
  });

  it('names the required manual assistive-technology testing in RTL/Farsi', () => {
    expect(doc).toMatch(/VoiceOver/);
    expect(doc).toMatch(/TalkBack/);
    expect(doc).toMatch(/NVDA/);
    expect(doc).toMatch(/RTL|Farsi/);
  });

  it('calls for keyboard-only runs and expert accessibility review', () => {
    expect(doc).toMatch(/keyboard-only/i);
    expect(doc).toMatch(/expert.*review/i);
  });
});
