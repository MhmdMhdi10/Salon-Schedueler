import { z } from 'zod';

/**
 * A salon service draft extracted from a salon's own website by Firecrawl
 * (the website-import feature). Mirrors the shape of `RegisterSalonService`
 * but every field is optional — extraction is best-effort and the owner confirms
 * it in the registration wizard before submit.
 */
export const ImportedServiceSchema = z.object({
  name: z.string().max(120),
  durationMinutes: z
    .number()
    .int()
    .positive()
    .max(24 * 60)
    .optional(),
  priceRial: z.number().int().nonnegative().optional(),
});

export type ImportedService = z.infer<typeof ImportedServiceSchema>;

/**
 * The salon draft extracted from an external website by the Firecrawl-backed
 * `WebsiteImportService`. Every field is optional: extraction is heuristic and
 * the owner reviews/prefills the registration form with whatever is recovered.
 */
export const SalonWebsiteDraftSchema = z.object({
  /** Salon display name, if recovered from the page <title>/headings. */
  salonName: z.string().max(120).optional(),
  /** Contact phone, if recovered (normalized to Latin digits, best-effort). */
  phone: z.string().max(40).optional(),
  /** Street / locality / region, if recovered. */
  address: z.string().max(300).optional(),
  /** Recovered service menu entries (name + optional duration/price). */
  services: z.array(ImportedServiceSchema).max(50).default([]),
  /** Recovered gallery / cover image URLs (absolute, deduped). */
  galleryImageUrls: z.array(z.string().url()).max(20).default([]),
});

export type SalonWebsiteDraft = z.infer<typeof SalonWebsiteDraftSchema>;

/**
 * Request body for `POST /api/import/website` — the salon's own website URL to
 * import a draft from. `http(s)` only; the owner must own the site they import.
 */
export const WebsiteImportRequestSchema = z.object({
  url: z
    .string()
    .url()
    .refine((u) => /^https?:\/\//i.test(u), {
      message: 'URL must use http or https',
    }),
});

export type WebsiteImportRequest = z.infer<typeof WebsiteImportRequestSchema>;
