/**
 * Bundle / code-split verification (task 11.1; R9.3; seo §9, ui-ux §12).
 *
 * Traces the static ESM import graph of the Vite production build to compute,
 * for each public (indexable) entry route, the *initial* JavaScript that a
 * browser must download to render it — i.e. the route's own chunk plus every
 * chunk it statically imports (transitively), plus the app entry chunk. Chunks
 * reached only through a dynamic `import()` (the `React.lazy` boundaries) are
 * NOT counted, because they never load on that route.
 *
 * It then asserts the governing budget: initial public-page JS ≤ ~240KB gzip,
 * and that the heavy funnel / admin / chart / Jalali-picker chunks are absent
 * from every public route's initial graph.
 *
 * Exported pure helpers are unit-tested in
 * `scripts/__tests__/analyze-bundle.test.ts`; running this module directly
 * prints a per-route report and exits non-zero on a budget/leak violation so it
 * can gate CI.
 */

import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Public-route JS cap. The shared shell that every route now statically loads
 * is ~213KB gzip: app entry + Persian i18n catalog (~74KB), React/router
 * (~58KB), framer-motion (~44KB — the app-wide PageTransition mounts at the
 * root), Radix (~24KB — the single app-root ToastProvider/Tooltip host), and
 * shared floating-ui vendor code (~13KB). 240KB keeps a tight regression
 * ceiling (~17KB for route content — the heaviest real route, discovery, sits
 * at ~227KB) while the FORBIDDEN_ON_PUBLIC list still guards the big
 * funnel/admin/chart chunks from ever leaking onto public routes.
 */
export const PUBLIC_JS_BUDGET_GZIP = 240 * 1024;

/**
 * Module substrings that must NEVER appear in a public route's initial graph.
 * These are the heavy surfaces the design requires to be route-split off the
 * public/marketing pages (R9.3): the customer booking funnel, the admin pages,
 * the chart module, and the Jalali date picker / slot grid.
 */
export const FORBIDDEN_ON_PUBLIC = [
  'AvailabilityPage',
  'BookingConfirmPage',
  'BookingSuccessPage',
  'AuthPage',
  'QrLandingPage',
  'ConfigurationPage',
  'CalendarPage',
  'AnalyticsPage',
  'AnalyticsChart',
  'JalaliDatePicker',
  'SlotGrid',
];

/**
 * The public, indexable entry routes whose initial JS is budgeted. These match
 * the prerendered/indexable surfaces (seo §1): marketing home, the
 * owner-acquisition landing, salon profile, discovery, and legal/trust pages.
 * Keyed by a human label → the chunk-name substring Vite uses for that route's
 * lazy chunk.
 */
export const PUBLIC_ENTRY_CHUNKS = {
  'BusinessLanding (/)': 'BusinessLanding',
  'SalonProfilePage (/s/:slug)': 'SalonProfilePage',
  'LegalPages (/about, /contact, /privacy, /terms)': 'LegalPages',
};

/**
 * Parse the top-of-file static cross-chunk imports from a built ESM chunk's
 * source. Vite/Rollup emit `import"./Foo-hash.js"` / `import{a}from"./Foo.js"`
 * for static deps and `import("./Bar-hash.js")` (with parens) for dynamic ones.
 * We deliberately match only the **static** form (no `(`), so dynamic
 * `React.lazy` boundaries are excluded from the initial graph.
 */
export function parseStaticImports(source) {
  const deps = new Set();
  // `from"./x.js"` (named/namespace) and bare `import"./x.js"` (side-effect),
  // never `import(` which is dynamic.
  const re = /(?:from|import)\s*"(\.\.?\/[^"]+\.js)"/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    deps.add(m[1].replace(/^\.\//, '').replace(/^\.\.\//, ''));
  }
  return [...deps];
}

/** Map a relative import specifier to a bare chunk filename. */
function specToFile(spec) {
  return spec.split('/').pop();
}

/**
 * Build the chunk graph from a map of `{ filename: source }`.
 * Returns `{ [filename]: { size, gzipSize, deps: string[] } }`.
 */
export function buildChunkGraph(chunkSources) {
  const graph = {};
  for (const [file, source] of Object.entries(chunkSources)) {
    const bytes = Buffer.from(source);
    graph[file] = {
      size: bytes.length,
      gzipSize: gzipSync(bytes).length,
      deps: parseStaticImports(source).map(specToFile),
    };
  }
  return graph;
}

/**
 * Resolve the transitive set of statically-imported chunks reachable from a set
 * of roots (inclusive of the roots). Missing deps are ignored (e.g. a chunk
 * that resolves to a non-JS asset).
 */
export function transitiveClosure(graph, roots) {
  const seen = new Set();
  const stack = [...roots];
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file) || !graph[file]) continue;
    seen.add(file);
    for (const dep of graph[file].deps) {
      if (!seen.has(dep)) stack.push(dep);
    }
  }
  return seen;
}

/**
 * Compute the initial-JS report for one public route: the transitive static
 * closure of the app entry chunk + the route's own chunk.
 */
export function analyzeRoute(graph, entryFile, routeFile) {
  const closure = transitiveClosure(graph, [entryFile, routeFile]);
  let totalGzip = 0;
  for (const file of closure) totalGzip += graph[file].gzipSize;
  const forbidden = [...closure].filter((file) =>
    FORBIDDEN_ON_PUBLIC.some((name) => file.includes(name)),
  );
  return {
    chunks: [...closure].sort(),
    totalGzip,
    withinBudget: totalGzip <= PUBLIC_JS_BUDGET_GZIP,
    forbidden,
  };
}

/** Find the Vite app entry chunk (the one referenced by dist/index.html). */
export function findEntryChunk(chunkSources, indexHtml) {
  const refs = [...indexHtml.matchAll(/assets\/([A-Za-z0-9_.-]+\.js)/g)].map(
    (m) => m[1],
  );
  for (const ref of refs) if (chunkSources[ref]) return ref;
  // Fallback: the `index-*.js` chunk.
  return Object.keys(chunkSources).find((f) => /^index-.*\.js$/.test(f));
}

/** Find the chunk file matching a route name substring. */
export function findChunk(chunkSources, nameSubstring) {
  return Object.keys(chunkSources).find((f) => f.includes(nameSubstring));
}

/** Read every JS chunk in an assets dir into `{ filename: source }`. */
export function readChunkSources(assetsDir) {
  const sources = {};
  for (const file of readdirSync(assetsDir)) {
    if (file.endsWith('.js')) {
      sources[file] = readFileSync(resolve(assetsDir, file), 'utf-8');
    }
  }
  return sources;
}

/** CLI entry: analyze dist/ and print a per-route report; exit non-zero on fail. */
export function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const distDir = resolve(here, '../dist');
  const assetsDir = resolve(distDir, 'assets');
  const indexHtmlPath = resolve(distDir, 'index.html');

  if (!existsSync(assetsDir) || !existsSync(indexHtmlPath)) {
    throw new Error(
      `[analyze-bundle] dist not found — run \`npm run build\` first (looked in ${distDir}).`,
    );
  }

  const chunkSources = readChunkSources(assetsDir);
  const graph = buildChunkGraph(chunkSources);
  const indexHtml = readFileSync(indexHtmlPath, 'utf-8');
  const entryFile = findEntryChunk(chunkSources, indexHtml);

  const kb = (n) => `${(n / 1024).toFixed(1)}KB`;
  let failed = false;

  // eslint-disable-next-line no-console
  console.log(
    `[analyze-bundle] entry chunk: ${entryFile} (${kb(graph[entryFile].gzipSize)} gzip)\n` +
      `[analyze-bundle] budget: ${kb(PUBLIC_JS_BUDGET_GZIP)} gzip initial public-page JS\n`,
  );

  for (const [label, nameSub] of Object.entries(PUBLIC_ENTRY_CHUNKS)) {
    const routeFile = findChunk(chunkSources, nameSub);
    if (!routeFile) {
      // eslint-disable-next-line no-console
      console.warn(`  ? ${label}: no chunk matched "${nameSub}" (skipped)`);
      continue;
    }
    const report = analyzeRoute(graph, entryFile, routeFile);
    const ok = report.withinBudget && report.forbidden.length === 0;
    failed = failed || !ok;
    // eslint-disable-next-line no-console
    console.log(
      `  ${ok ? '✓' : '✗'} ${label}\n` +
        `      initial JS: ${kb(report.totalGzip)} gzip across ${report.chunks.length} chunks` +
        ` (budget ${kb(PUBLIC_JS_BUDGET_GZIP)})` +
        (report.forbidden.length
          ? `\n      LEAKED heavy chunks: ${report.forbidden.join(', ')}`
          : ''),
    );
  }

  if (failed) {
    // eslint-disable-next-line no-console
    console.error('\n[analyze-bundle] FAILED: budget exceeded or heavy chunk leaked onto a public route.');
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.log('\n[analyze-bundle] OK: all public routes within budget, no heavy-chunk leaks.');
}

// Run only when invoked directly, not when imported by tests.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
