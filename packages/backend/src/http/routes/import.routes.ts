import { Router } from 'express';
import { WebsiteImportRequestSchema } from '@salon/shared';
import type { Services } from '../app.js';
import { asyncRoute } from './route-helpers.js';

/**
 * Public website-import route (the website-import feature; Requirement 12.6).
 *
 *   POST /api/import/website  { url }  -> 200 { draft }   (Firecrawl enabled)
 *                                     | 503 IMPORT_DISABLED (no Firecrawl configured)
 *                                     | 502 IMPORT_FAILED   (scrape failed)
 *
 * Scrapes a salon's own website with Firecrawl and returns a best-effort salon
 * draft (name, phone, address, services, gallery) so the registration wizard can
 * prefill the form. The owner reviews the result before submit — extraction is
 * heuristic, never authoritative. Public (no auth) because it is used during
 * unauthenticated salon self-registration.
 */
export function importRouter(services: Services): Router {
  const router = Router();

  router.post(
    '/import/website',
    asyncRoute(async (req, res) => {
      const parsed = WebsiteImportRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        res.status(400).json({
          code: 'VALIDATION_ERROR',
          field: first?.path.join('.') ?? 'url',
        });
        return;
      }

      if (!services.websiteImportService.enabled) {
        res.status(503).json({ code: 'IMPORT_DISABLED' });
        return;
      }

      try {
        const draft = await services.websiteImportService.importFromUrl(parsed.data.url);
        if (!draft) {
          res.status(503).json({ code: 'IMPORT_DISABLED' });
          return;
        }
        res.status(200).json({ draft });
      } catch {
        // Scraping can fail for many reasons (blocked, timeout, 5xx); surface a
        // single stable code so the wizard can fall back to manual entry.
        res.status(502).json({ code: 'IMPORT_FAILED' });
      }
    }),
  );

  return router;
}
