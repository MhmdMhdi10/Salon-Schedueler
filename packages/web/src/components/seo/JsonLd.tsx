import { Helmet } from 'react-helmet-async';

/**
 * A single schema.org JSON-LD node. Loosely typed (`@type` plus arbitrary
 * properties) so callers can build `WebSite`, `Organization`, `BeautySalon`,
 * `Service`, `BreadcrumbList`, etc. without a bespoke type per shape, while
 * still nudging them to set `@type`.
 */
export type JsonLdNode = {
  '@context'?: string;
  '@type': string;
  [key: string]: unknown;
};

/**
 * `<JsonLd>` — injects validated structured data as a
 * `<script type="application/ld+json">` into the document head (seo §5; R8.4).
 *
 * Emitted through `react-helmet-async` so the script is prerender/SSR-safe and
 * lands in the **initial HTML** of public routes (seo §8) — structured data
 * applied only after hydration is unreliable for rich results.
 *
 * ## Validation before injection
 *
 * Only well-formed nodes are emitted. Each node must be a plain object carrying
 * a non-empty `@type`; the component fills in the default
 * `@context: "https://schema.org"` when absent. Anything that fails validation
 * is dropped (and surfaced via `console.warn` in dev) rather than emitting
 * broken markup that would fail Google's Rich Results Test. The payload is
 * serialized with a guard against `<`/`>`/`&` so it can never break out of the
 * `<script>` element.
 *
 * Per seo §5, only mark up content **visible** on the page and never fabricate
 * reviews/ratings — that's a caller responsibility; this component just emits
 * what it's given, safely.
 *
 * Usage:
 *   <JsonLd data={{ '@type': 'WebSite', name: 'رزرو سالن', url: 'https://example.ir' }} />
 *   <JsonLd data={[beautySalonNode, serviceNode, breadcrumbNode]} />
 */
export interface JsonLdProps {
  /** A single JSON-LD node or an array of nodes (each emitted as its own script). */
  data: JsonLdNode | JsonLdNode[];
}

const SCHEMA_CONTEXT = 'https://schema.org';

/** True when `value` is a plain object (not null, not an array). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

/**
 * Validates a node and returns it with a default `@context`, or `null` if it is
 * not a usable schema.org node (missing/empty `@type`, or not an object).
 */
export function normalizeJsonLdNode(node: unknown): JsonLdNode | null {
  if (!isPlainObject(node)) return null;
  const type = node['@type'];
  if (typeof type !== 'string' || type.trim() === '') return null;
  return {
    '@context': SCHEMA_CONTEXT,
    ...(node as JsonLdNode),
  };
}

/**
 * Serializes a node to a string safe to embed inside `<script>`. Escapes the
 * characters that could close the element or be interpreted as HTML so the
 * payload can never break out of the script context.
 */
export function serializeJsonLd(node: JsonLdNode): string {
  return JSON.stringify(node)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

export function JsonLd({ data }: JsonLdProps) {
  const nodes = Array.isArray(data) ? data : [data];
  const valid = nodes
    .map(normalizeJsonLdNode)
    .filter((node): node is JsonLdNode => node !== null);

  if (import.meta.env?.DEV && valid.length !== nodes.length) {
    // eslint-disable-next-line no-console
    console.warn(
      `[JsonLd] Dropped ${nodes.length - valid.length} invalid structured-data node(s); each node must be an object with a non-empty "@type".`,
    );
  }

  if (valid.length === 0) return null;

  return (
    <Helmet>
      {valid.map((node, i) => (
        <script key={i} type="application/ld+json">
          {serializeJsonLd(node)}
        </script>
      ))}
    </Helmet>
  );
}
