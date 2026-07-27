import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';

/**
 * Distinctiveness guardrail — anti-generic source scan
 * (signature-ui-system task 16.2; R2.1, R2.3, R6.1, R6.2, R9.5, R11.3, R11.4).
 *
 * `Feature: signature-ui-system, Property 19: The distinctiveness guardrail flags generic regressions`
 * `Feature: signature-ui-system, Property 20: Guardrail violations are reported with file and rule`
 *
 * This vitest scans **authored web source** (`src/**\/*.{ts,tsx,css}`) and fails
 * on the tell-tale patterns of a generic, "AI-default" UI — reporting each
 * violating file + the rule it broke so the regression can be located and
 * corrected (design §7). It is a **regression tripwire, not a certificate**: a
 * pure-regex scan cannot prove semantic distinctiveness, so it is scoped tightly
 * to stay low-noise and complements (does not replace) `contrast.test.ts`, the
 * `vitest-axe` suites, and the Lighthouse a11y/CWV gate.
 *
 * Four forbidden patterns (design §7 detection table):
 *
 *  1. **No indigo→purple gradient** — a `linear/radial/conic-gradient(...)`
 *     combined with the indigo/purple hex family
 *     (`#6366f1`,`#818cf8`,`#a855f7`,`#8b5cf6`,`#d946ef`,`#e879f9`), or the
 *     Tailwind `from-indigo`/`to-purple`/`via-*` gradient classes (R2.1).
 *  2. **No physical left/right for flow spacing** — CSS `margin/padding-left|right`,
 *     a CSS `left:`/`right:` property, the React camelCase `marginLeft`/`paddingRight`
 *     inline-style props, or the Tailwind `ml|mr|pl|pr|left|right-` utilities.
 *     `rtl:`/`ltr:`-prefixed overrides and logical utilities (`ms/me/ps/pe`,
 *     `start/end`, `inset-inline-*`) are compliant (R9.5).
 *  3. **No raw hex/px/ms in authored styles** — a hex color, `Npx`, or `Nms`
 *     literal that appears in a *style context*: a CSS declaration value, a
 *     Tailwind arbitrary color (`bg-[#5457e6]`), or an inline `style={{…}}`
 *     value. Token-mapped utilities, Tailwind arbitrary *sizes* (`min-h-[44px]`
 *     touch targets), and plain data/constants (a manifest `theme_color`, the
 *     WCAG `#FFFFFF` math constant) are NOT styles and are not flagged (R6.1/R9.5).
 *  4. **Library usage carries signature tokens** — a Component_Library element
 *     (`Button`, `Card`, `Badge`, …) styled with an inline color/`style` literal
 *     instead of tokens (R2.3).
 *
 * **Scope / low-noise (design §7):** tests, the token definition stylesheet
 * (`tokens.css`), the generated/3D `components/three`, and the QR branded
 * marketing-asset studio (`marketing-assets.ts`, `qr-svg.ts`, `owner-qr.css` —
 * where accent literals legitimately live) are excluded. An inline
 * `// distinctiveness-ok: <reason>` comment opts a line out for the rare
 * legitimate literal (e.g. an SVG `viewBox`).
 *
 * Validates: Requirements 2.1, 2.3, 6.1, 6.2, 9.5, 11.3, 11.4
 */

// ---------------------------------------------------------------------------
// Rule catalogue
// ---------------------------------------------------------------------------

/** The four guardrail rules, each carrying a human label + requirement refs. */
const RULES = {
  'indigo-purple-gradient': {
    label: 'No indigo→purple gradient literal',
    reqs: 'R2.1, R11.3',
  },
  'physical-left-right': {
    label: 'No physical left/right for flow-relative spacing',
    reqs: 'R9.5, R11.3',
  },
  'raw-style-literal': {
    label: 'No raw hex/px/ms literal in authored styles',
    reqs: 'R6.1, R9.5, R11.3',
  },
  'library-inline-literal': {
    label: 'Component_Library usage omits signature tokens (inline color/style literal)',
    reqs: 'R2.3, R11.3',
  },
} as const;

type RuleId = keyof typeof RULES;

/** A single guardrail violation: which file, which rule, and where. */
interface Violation {
  /** Forward-slash path relative to `src/`. */
  file: string;
  /** The rule the line broke. */
  rule: RuleId;
  /** 1-based line number in the file. */
  line: number;
  /** The offending source line (trimmed) for the report. */
  snippet: string;
}

// ---------------------------------------------------------------------------
// Detection regexes (design §7 detection table)
// ---------------------------------------------------------------------------

/** The indigo/purple hex family that marks the generic AI palette. */
const INDIGO_PURPLE_HEX = /#(?:6366f1|818cf8|a855f7|8b5cf6|d946ef|e879f9)\b/i;
/** Any CSS gradient function. */
const GRADIENT_FN = /(?:linear|radial|conic)-gradient\s*\(/i;
/** Tailwind indigo/purple gradient stops. */
const TW_GRADIENT_INDIGO_PURPLE = /\b(?:from|via|to)-(?:indigo|purple|violet|fuchsia)\b/i;

/** CSS physical spacing properties (`margin-left`, `padding-right`). */
const CSS_PHYSICAL_PROP = /\b(?:margin|padding)-(?:left|right)\b/i;
/** A CSS positional `left:`/`right:` property declaration. */
const CSS_PHYSICAL_POS = /(?:^|[;{]|\s)(?:left|right)\s*:/i;
/** React camelCase physical inline-style props (`marginLeft`, `paddingRight`). */
const REACT_PHYSICAL_CAMEL = /\b(?:margin|padding)(?:Left|Right)\b/;

/** Any hex color literal (`#rgb`/`#rgba`/`#rrggbb`/`#rrggbbaa`). */
const HEX = /#[0-9a-fA-F]{3,8}\b/;
/** A raw pixel/millisecond literal (`12px`, `150ms`, `0.5px`). */
const PX_MS = /\b\d*\.?\d+(?:px|ms)\b/i;
/** A hex color baked into a Tailwind arbitrary value (`bg-[#5457e6]`). */
const TW_ARBITRARY_HEX = /\[#[0-9a-fA-F]{3,8}\b/;
/** The start of an inline `style=` attribute on a line. */
const STYLE_ATTR = /style\s*=\s*(?:\{\{|\{|")/;
/** Captures an inline `style=` value (same-line) so literals are judged in-context. */
const STYLE_VALUE = /style\s*=\s*(\{\{[^}]*\}\}|\{[^}]*\}|"[^"]*")/;
/** Known Component_Library element tags (components/ui + brand/typography helpers). */
const UI_COMPONENT_TAG =
  /<(?:Button|Card|Badge|Select|Switch|RadioGroup|SlotGrid|JalaliDatePicker|JalaliDate|Toast|EmptyState|ErrorState|Skeleton|Avatar|Dialog|Sheet|Tabs|TextField|Textarea|Checkbox|IconButton|Tooltip|Spinner|Num|Money|DirText|Picture|Field|Motif)\b/;

/** The opt-out marker that exempts its own line and the line immediately below. */
const OPT_OUT = /distinctiveness-ok\s*:/i;

// ---------------------------------------------------------------------------
// Pure scanner
// ---------------------------------------------------------------------------

/**
 * Is `token` a physical (non-logical) Tailwind spacing/position utility?
 * Splits off variant prefixes (`md:`, `hover:`) and a leading negative sign,
 * treats `rtl:`/`ltr:`-prefixed overrides as compliant, and matches only the
 * physical families `ml|mr|pl|pr|left|right-<value>` — so logical utilities
 * (`ms/me/ps/pe`, `start/end`, `inset-inline-*`) and unrelated classes
 * (`text-left`, `object-right`, `mx-auto`) never match.
 */
function isPhysicalTailwindUtility(token: string): boolean {
  const negStripped = token.startsWith('-') ? token.slice(1) : token;
  const parts = negStripped.split(':');
  const util = parts[parts.length - 1];
  const variants = parts.slice(0, -1);
  // `rtl:`/`ltr:` sign-flip overrides are the sanctioned RTL escape hatch.
  if (variants.includes('rtl') || variants.includes('ltr')) return false;
  return /^(?:ml|mr|pl|pr|left|right)-(?:\d|\[|px|auto|full)/.test(util);
}

/** Does a line use any physical Tailwind utility (RTL-compliant ones aside)? */
function hasPhysicalTailwind(line: string): boolean {
  for (const token of line.split(/[\s"'`{}()=,;]+/)) {
    if (token && isPhysicalTailwindUtility(token)) return true;
  }
  return false;
}

/** All rules a single (comment-stripped) line breaks. */
function detectLine(line: string, isCss: boolean): RuleId[] {
  const rules = new Set<RuleId>();

  // Rule 1 — indigo→purple gradient.
  if (
    (GRADIENT_FN.test(line) && INDIGO_PURPLE_HEX.test(line)) ||
    TW_GRADIENT_INDIGO_PURPLE.test(line)
  ) {
    rules.add('indigo-purple-gradient');
  }

  // Rule 2 — physical left/right for flow-relative spacing.
  if (
    CSS_PHYSICAL_PROP.test(line) ||
    REACT_PHYSICAL_CAMEL.test(line) ||
    (isCss && CSS_PHYSICAL_POS.test(line)) ||
    hasPhysicalTailwind(line)
  ) {
    rules.add('physical-left-right');
  }

  // Rules 3 & 4 — raw literals in authored styles / library inline literals.
  if (isCss) {
    // A CSS declaration value is unambiguously an authored style.
    if (HEX.test(line) || PX_MS.test(line)) rules.add('raw-style-literal');
  } else {
    const styleValue = line.match(STYLE_VALUE)?.[1] ?? '';
    const inlineStyleHasLiteral =
      STYLE_ATTR.test(line) && (HEX.test(styleValue) || PX_MS.test(styleValue));
    const arbitraryHex = TW_ARBITRARY_HEX.test(line);
    if (inlineStyleHasLiteral || arbitraryHex) {
      // Attribute the literal to the library rule when it sits on a known
      // Component_Library element; otherwise it is a generic raw-style literal.
      rules.add(UI_COMPONENT_TAG.test(line) ? 'library-inline-literal' : 'raw-style-literal');
    }
  }

  return [...rules];
}

/**
 * Blank out comments while preserving line structure (so reported line numbers
 * stay accurate) and string literals (so URLs like `https://…` and in-string
 * style literals like `'#fff'` survive). Stripping only ever *removes* text, so
 * it can introduce false negatives but never false positives. CSS has no `//`
 * line comments, so they are only honoured for TS/TSX.
 */
function stripComments(src: string, lineComments: boolean): string {
  type State = 'code' | 'line' | 'block' | 'sq' | 'dq' | 'tpl';
  let state: State = 'code';
  let out = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const d = src[i + 1];
    const blank = c === '\n' ? '\n' : c === '\t' ? '\t' : ' ';
    switch (state) {
      case 'code':
        if (lineComments && c === '/' && d === '/') {
          out += '  ';
          i++;
          state = 'line';
        } else if (c === '/' && d === '*') {
          out += '  ';
          i++;
          state = 'block';
        } else if (c === "'") {
          out += c;
          state = 'sq';
        } else if (c === '"') {
          out += c;
          state = 'dq';
        } else if (c === '`') {
          out += c;
          state = 'tpl';
        } else {
          out += c;
        }
        break;
      case 'line':
        if (c === '\n') {
          out += c;
          state = 'code';
        } else {
          out += blank;
        }
        break;
      case 'block':
        if (c === '*' && d === '/') {
          out += '  ';
          i++;
          state = 'code';
        } else {
          out += blank;
        }
        break;
      case 'sq':
      case 'dq':
      case 'tpl': {
        out += c;
        if (c === '\\') {
          if (i + 1 < src.length) out += src[i + 1];
          i++;
        } else if (
          (state === 'sq' && c === "'") ||
          (state === 'dq' && c === '"') ||
          (state === 'tpl' && c === '`')
        ) {
          state = 'code';
        }
        break;
      }
    }
  }
  return out;
}

/** Lines exempt via `// distinctiveness-ok:` (the marker line + the next line). */
function optOutLines(originalLines: string[]): Set<number> {
  const exempt = new Set<number>();
  originalLines.forEach((line, index) => {
    if (OPT_OUT.test(line)) {
      exempt.add(index + 1); // trailing marker on the same line
      exempt.add(index + 2); // leading marker on the line above
    }
  });
  return exempt;
}

/**
 * Scan one file's source for guardrail violations. Pure: deterministic for a
 * given `(relPath, source)` and free of I/O, so it is directly property-tested.
 */
function scanContent(relPath: string, source: string): Violation[] {
  const isCss = relPath.endsWith('.css');
  const original = source.split('\n');
  const exempt = optOutLines(original);
  const sanitized = stripComments(source, !isCss).split('\n');

  const violations: Violation[] = [];
  for (let i = 0; i < sanitized.length; i++) {
    const lineNo = i + 1;
    if (exempt.has(lineNo)) continue;
    for (const rule of detectLine(sanitized[i], isCss)) {
      violations.push({
        file: relPath,
        rule,
        line: lineNo,
        snippet: (original[i] ?? '').trim().slice(0, 140),
      });
    }
  }
  return violations;
}

/** Render violations into a readable, locate-and-fix report (R11.4). */
function formatReport(violations: Violation[]): string {
  if (violations.length === 0) return 'No distinctiveness violations found.';
  const lines = violations.map(
    (v) =>
      `  ${v.file}:${v.line} — [${RULES[v.rule].label}] (${RULES[v.rule].reqs})\n      ${v.snippet}`,
  );
  return [`Distinctiveness guardrail found ${violations.length} violation(s):`, ...lines].join(
    '\n',
  );
}

// ---------------------------------------------------------------------------
// Authored-source collection + scoping
// ---------------------------------------------------------------------------

const HERE = resolve(fileURLToPath(import.meta.url), '..'); // .../src/styles
const SRC_DIR = resolve(HERE, '..'); // .../src

/** Normalise an absolute path to a forward-slash path relative to `src/`. */
function relToSrc(abs: string): string {
  return relative(SRC_DIR, abs).split(sep).join('/');
}

/**
 * Files/dirs excluded from the scan (design §7 low-noise scoping):
 *  - tests + test infra,
 *  - the token definition stylesheet,
 *  - the generated/3D `components/three`,
 *  - the QR branded marketing-asset studio (accent literals legitimately live
 *    there — sibling of the explicitly-excluded `marketing-assets.ts`).
 */
function isExcluded(rel: string): boolean {
  if (/\.(test|spec)\./.test(rel)) return true;
  if (rel.split('/').includes('__tests__')) return true;
  if (rel.startsWith('test/')) return true;
  if (rel === 'styles/tokens.css') return true;
  if (rel.startsWith('components/three/')) return true;
  if (rel === 'pages/owner/marketing-assets.ts') return true;
  if (rel === 'pages/owner/qr-svg.ts') return true;
  if (rel === 'pages/owner/owner-qr.css') return true;
  return false;
}

/** Recursively collect in-scope authored source files. */
function collectAuthoredFiles(dir: string): Array<{ abs: string; rel: string }> {
  const out: Array<{ abs: string; rel: string }> = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectAuthoredFiles(abs));
      continue;
    }
    if (!/\.(ts|tsx|css)$/.test(entry.name)) continue;
    const rel = relToSrc(abs);
    if (isExcluded(rel)) continue;
    out.push({ abs, rel });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The regression tripwire — scan the real authored source
// ---------------------------------------------------------------------------

describe('distinctiveness guardrail — authored web source (regression tripwire)', () => {
  const files = collectAuthoredFiles(SRC_DIR);

  it('collects a meaningful set of authored source files to scan', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('flags no generic-pattern regressions in authored source', () => {
    const violations = files.flatMap((f) => scanContent(f.rel, readFileSync(f.abs, 'utf8')));
    // The message lists every file + rule so a real regression is locatable.
    expect(violations, formatReport(violations)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Property 19 — flags iff a forbidden pattern is present
// ---------------------------------------------------------------------------

/** Compliant Tailwind/utility tokens that must NEVER trip the scanner. */
const COMPLIANT_TOKENS = [
  'flex',
  'grid',
  'bg-primary',
  'bg-surface',
  'text-text',
  'text-muted',
  'rounded-pill',
  'rounded-lg',
  'shadow-1',
  'gap-2',
  'gap-4',
  'ms-2', // logical inline-start margin
  'me-3', // logical inline-end margin
  'ps-4', // logical inline-start padding
  'pe-4', // logical inline-end padding
  'mt-2',
  'mb-4',
  'mx-auto',
  'px-4', // padding utility, NOT a "12px" literal
  'py-3',
  'text-start',
  'text-end',
  'inset-inline-start-0',
  'duration-fast',
  'ease-standard',
  'min-h-[44px]', // arbitrary touch-target size — sanctioned escape hatch
  'h-[280px]', // arbitrary size — sanctioned escape hatch
  'opacity-100',
  'transition-transform',
] as const;

/** A guaranteed-compliant line (token classes only, token-driven content). */
const compliantLine = fc
  .uniqueArray(fc.constantFrom(...COMPLIANT_TOKENS), {
    minLength: 1,
    maxLength: 4,
  })
  .map((tokens) => `      <div className="${tokens.join(' ')}">سلام</div>`);

/** A forbidden snippet for each rule, each tripping exactly its own rule. */
const FORBIDDEN: Record<RuleId, readonly string[]> = {
  'indigo-purple-gradient': [
    '      <div className="bg-gradient-to-r from-indigo-500 to-purple-600">x</div>',
    '      <span className="from-indigo-400 via-purple-500">x</span>',
  ],
  'physical-left-right': [
    '      <div className="flex ml-4">x</div>',
    '      <div className="pl-2 right-0">x</div>',
  ],
  'raw-style-literal': [
    '      <div className="bg-[#5457e6]">x</div>',
    "      <div style={{ padding: '12px' }}>x</div>",
    "      <div style={{ color: '#abc123' }}>x</div>",
  ],
  'library-inline-literal': [
    "      <Button style={{ background: '#5457e6' }}>x</Button>",
    '      <Card className="bg-[#112233]">x</Card>',
  ],
};

const ruleIds = Object.keys(RULES) as RuleId[];

describe('Property 19 — the guardrail flags a file iff it contains a forbidden pattern', () => {
  it('passes a purely compliant line (logical utilities, token classes, arbitrary touch-targets)', () => {
    fc.assert(
      fc.property(compliantLine, (line) => {
        expect(scanContent('pages/Sample.tsx', line)).toEqual([]);
      }),
    );
  });

  it('flags every forbidden snippet under its own rule (and only when present)', () => {
    const choices = fc.constantFrom<'none' | RuleId>('none', ...ruleIds);
    fc.assert(
      fc.property(choices, compliantLine, fc.nat(), (choice, base, pick) => {
        if (choice === 'none') {
          expect(scanContent('pages/Sample.tsx', base)).toEqual([]);
          return;
        }
        const options = FORBIDDEN[choice];
        const forbidden = options[pick % options.length];
        const content = `${base}\n${forbidden}`;
        const flaggedRules = new Set(scanContent('pages/Sample.tsx', content).map((v) => v.rule));
        // "if and only if": the forbidden snippet's own rule must be flagged.
        expect(flaggedRules.has(choice)).toBe(true);
      }),
    );
  });

  it('honours the `// distinctiveness-ok:` opt-out (trailing and leading)', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ruleIds), fc.nat(), fc.boolean(), (rule, pick, leading) => {
        const options = FORBIDDEN[rule];
        const forbidden = options[pick % options.length];
        const content = leading
          ? `      // distinctiveness-ok: justified for the test\n${forbidden}`
          : `${forbidden} // distinctiveness-ok: justified for the test`;
        expect(scanContent('pages/Sample.tsx', content)).toEqual([]);
      }),
    );
  });

  it('treats rtl:/ltr:-prefixed physical overrides and logical utilities as compliant', () => {
    const compliantPhysical = [
      '      <div className="rtl:ml-4 ltr:mr-4">x</div>',
      '      <div className="ms-2 me-4 ps-3 pe-3 start-0 end-0">x</div>',
      '      <div className="text-start text-end inset-inline-start-0">x</div>',
    ];
    fc.assert(
      fc.property(fc.constantFrom(...compliantPhysical), (line) => {
        const rules = scanContent('pages/Sample.tsx', line).map((v) => v.rule);
        expect(rules).not.toContain('physical-left-right');
      }),
    );
  });

  it('does not flag literals outside a style context (plain constants, manifest data, comments)', () => {
    const nonStyle = [
      "      const SIGNATURE_THEME_COLOR = '#8E2F50';", // a runtime/manifest color constant
      "      const FALLBACK = { light: '#ffffff', dark: '#17110F' };",
      '      const WHITE = "#FFFFFF"; // WCAG contrast math constant',
      '      // the old indigo #6366f1 gradient is gone',
      '      <img sizes="(min-width: 1024px) 33vw, 100vw" />', // media condition, not a style px
    ];
    fc.assert(
      fc.property(fc.constantFrom(...nonStyle), (line) => {
        expect(scanContent('pwa/sample.ts', line)).toEqual([]);
      }),
    );
  });

  it('flags a CSS gradient + indigo/purple hex and a CSS physical property', () => {
    const css = '.hero { background: linear-gradient(90deg, #6366f1, #a855f7); margin-left: 8px; }';
    const rules = scanContent('styles/sample.css', css).map((v) => v.rule);
    expect(rules).toContain('indigo-purple-gradient');
    expect(rules).toContain('physical-left-right');
    expect(rules).toContain('raw-style-literal'); // the #hex / 8px literals
  });
});

// ---------------------------------------------------------------------------
// Property 20 — each violation is reported with its file and rule
// ---------------------------------------------------------------------------

/** A synthetic in-scope file carrying exactly one known rule violation. */
const fileWithViolation = fc
  .record({
    path: fc.constantFrom(
      'pages/A.tsx',
      'pages/B.tsx',
      'components/ui/C.tsx',
      'components/layout/D.tsx',
      'pwa/E.ts',
    ),
    rule: fc.constantFrom(...ruleIds),
    pick: fc.nat(),
  })
  .map(({ path, rule, pick }) => {
    const options = FORBIDDEN[rule];
    return { path, rule, content: options[pick % options.length] };
  });

describe('Property 20 — guardrail violations carry their file path and the broken rule', () => {
  it('reports each violation with a non-empty file, a known rule, and a line number', () => {
    fc.assert(
      fc.property(fc.array(fileWithViolation, { minLength: 1, maxLength: 6 }), (specs) => {
        const all = specs.flatMap((s) => scanContent(s.path, s.content));
        const report = formatReport(all);

        // Each injected (file, rule) pair surfaces in the results.
        for (const s of specs) {
          const found = all.find((v) => v.file === s.path && v.rule === s.rule);
          expect(found, `${s.path} should report ${s.rule}`).toBeDefined();
        }

        // Every reported violation is fully located: file + rule + line, and
        // both the path and the rule label appear in the rendered report.
        for (const v of all) {
          expect(v.file.length).toBeGreaterThan(0);
          expect(RULES[v.rule]).toBeDefined();
          expect(v.line).toBeGreaterThanOrEqual(1);
          expect(report).toContain(v.file);
          expect(report).toContain(RULES[v.rule].label);
        }
      }),
    );
  });

  it('renders an empty, non-throwing report when there are no violations', () => {
    expect(formatReport([])).toMatch(/no distinctiveness violations/i);
  });
});
