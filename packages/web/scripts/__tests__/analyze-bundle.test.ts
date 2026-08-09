import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
// @ts-expect-error — plain ESM build script, no type declarations.
import {
  PUBLIC_JS_BUDGET_GZIP,
  FORBIDDEN_ON_PUBLIC,
  PUBLIC_ENTRY_CHUNKS,
  parseStaticImports,
  buildChunkGraph,
  transitiveClosure,
  analyzeRoute,
  findEntryChunk,
  findChunk,
  readChunkSources,
} from '../analyze-bundle.mjs';

/**
 * Bundle / code-split verification (task 11.1; R9.3; seo §9, ui-ux §12).
 *
 * Two layers:
 *
 *  1. **Pure-helper unit tests** pin the import-graph logic that decides what a
 *     public route's *initial* JS is: only statically-imported chunks count;
 *     dynamic `import()` (`React.lazy`) boundaries are excluded; the budget and
 *     forbidden-chunk checks behave as specified. These run with no build.
 *
 *  2. **A built-artifact guard** that, *when `dist/` exists*, asserts the real
 *     production build keeps every public (indexable) route within the ~240KB
 *     gzip budget and free of the heavy funnel/admin/chart/Jalali-picker
 *     chunks. This is the regression guard for the code-split contract: if a
 *     future change statically pulls an overlay/Radix/chart module onto a
 *     public page, or blows the budget, this fails. It is skipped (not failed)
 *     when `dist/` is absent so the unit suite stays runnable without a build.
 */

describe('parseStaticImports', () => {
  it('captures static named/namespace/side-effect imports', () => {
    const src = [
      'import{a,b}from"./Foo-abc.js";',
      'import * as N from"./Bar-def.js";',
      'import"./Baz-ghi.js";',
    ].join('\n');
    const deps = parseStaticImports(src).sort();
    expect(deps).toEqual(['Bar-def.js', 'Baz-ghi.js', 'Foo-abc.js']);
  });

  it('EXCLUDES dynamic import() boundaries (React.lazy chunks)', () => {
    const src = 'const p=import("./Lazy-xyz.js");import{a}from"./Static-1.js";';
    const deps = parseStaticImports(src);
    expect(deps).toContain('Static-1.js');
    expect(deps).not.toContain('Lazy-xyz.js');
  });
});

describe('transitiveClosure', () => {
  const graph = {
    'entry.js': { size: 10, gzipSize: 10, deps: ['a.js'] },
    'a.js': { size: 10, gzipSize: 10, deps: ['b.js'] },
    'b.js': { size: 10, gzipSize: 10, deps: [] },
    'island.js': { size: 10, gzipSize: 10, deps: [] },
  };

  it('includes roots and all statically-reachable chunks', () => {
    const closure = transitiveClosure(graph, ['entry.js']);
    expect([...closure].sort()).toEqual(['a.js', 'b.js', 'entry.js']);
  });

  it('does not reach unrelated islands', () => {
    const closure = transitiveClosure(graph, ['entry.js']);
    expect(closure.has('island.js')).toBe(false);
  });
});

describe('analyzeRoute budget + forbidden detection', () => {
  it('flags a route that statically pulls a forbidden chunk', () => {
    const sources = {
      'entry.js': 'import"./vendor.js";',
      'vendor.js': 'x'.repeat(100),
      'Route.js': 'import"./AnalyticsChart-abc.js";',
      'AnalyticsChart-abc.js': 'y'.repeat(100),
    };
    const graph = buildChunkGraph(sources);
    const report = analyzeRoute(graph, 'entry.js', 'Route.js');
    expect(report.forbidden).toContain('AnalyticsChart-abc.js');
  });

  it('passes a lean route with no forbidden chunks and small payload', () => {
    const sources = {
      'entry.js': 'import"./vendor.js";',
      'vendor.js': 'x'.repeat(100),
      'Route.js': 'import"./SeoHead-abc.js";',
      'SeoHead-abc.js': 'y'.repeat(100),
    };
    const graph = buildChunkGraph(sources);
    const report = analyzeRoute(graph, 'entry.js', 'Route.js');
    expect(report.forbidden).toEqual([]);
    expect(report.withinBudget).toBe(true);
  });

  it('marks withinBudget=false when gzip total exceeds the budget', () => {
    // Incompressible random content so the gzip size actually exceeds the
    // budget (structured/repeated bytes would compress away).
    const big = randomBytes(PUBLIC_JS_BUDGET_GZIP * 2).toString('base64');
    const sources = {
      'entry.js': 'import"./vendor.js";',
      'vendor.js': big,
      'Route.js': '',
    };
    const graph = buildChunkGraph(sources);
    expect(graph['vendor.js'].gzipSize).toBeGreaterThan(PUBLIC_JS_BUDGET_GZIP);
    const report = analyzeRoute(graph, 'entry.js', 'Route.js');
    expect(report.withinBudget).toBe(false);
  });
});

describe('built-artifact guard (R9.3 code-split contract)', () => {
  const distDir = resolve(__dirname, '../../dist');
  const assetsDir = resolve(distDir, 'assets');
  const indexHtmlPath = resolve(distDir, 'index.html');
  const built = existsSync(assetsDir) && existsSync(indexHtmlPath);

  it.runIf(built)(
    'keeps every public route within budget and free of heavy chunks',
    () => {
      const chunkSources = readChunkSources(assetsDir);
      const graph = buildChunkGraph(chunkSources);
      const indexHtml = readFileSync(indexHtmlPath, 'utf-8');
      const entryFile = findEntryChunk(chunkSources, indexHtml);
      expect(entryFile).toBeTruthy();

      for (const nameSub of Object.values(PUBLIC_ENTRY_CHUNKS)) {
        const routeFile = findChunk(chunkSources, nameSub as string);
        expect(routeFile, `missing public route chunk for ${nameSub}`).toBeTruthy();
        const report = analyzeRoute(graph, entryFile, routeFile);

        // No funnel/admin/chart/Jalali chunk ever loads on a public page.
        expect(
          report.forbidden,
          `${nameSub} leaked heavy chunks: ${report.forbidden.join(', ')}`,
        ).toEqual([]);

        // Initial public-page JS stays within the ~240KB gzip budget.
        expect(
          report.totalGzip,
          `${nameSub} initial JS ${(report.totalGzip / 1024).toFixed(1)}KB exceeds budget`,
        ).toBeLessThanOrEqual(PUBLIC_JS_BUDGET_GZIP);
      }
    },
  );

  it.skipIf(built)('skipped: no dist/ build present', () => {
    expect(FORBIDDEN_ON_PUBLIC.length).toBeGreaterThan(0);
  });
});
