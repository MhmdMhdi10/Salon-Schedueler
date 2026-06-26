import { Router, type RequestHandler } from 'express';
import type { Services } from '../app.js';
import { asyncRoute, validateRequired } from './route-helpers.js';

/**
 * Public salon routes (Requirement 2.6, 2.7 / original R7, R8). These are
 * publicly accessible without authentication; `optionalAuth` attaches the
 * principal when a token is present but never rejects.
 *
 * - GET /salons/by-qr/:payload          -> 200 { salon: { id, name } }
 * - GET /salons/:id/services            -> 200 { services: [...] }
 * - GET /salons/:id/availability?serviceId=&date= -> 200 { slots: [...] }
 *
 * QR resolution returns distinct codes: QR_MALFORMED (400) vs QR_UNREGISTERED
 * (404) so clients can show distinct messages (Requirement 2.6).
 */
export function salonRouter(services: Services, optionalAuth: RequestHandler): Router {
  const router = Router();

  router.use(optionalAuth);

  // Resolve a scanned QR payload to a salon. The route param is URL-decoded by
  // Express; SalonRegistration distinguishes malformed from unregistered.
  router.get(
    '/salons/by-qr/:payload',
    asyncRoute(async (req, res) => {
      const salon = await services.salonRegistration.resolveSalonByQr(req.params.payload);
      res.status(200).json({ salon: { id: salon.id, name: salon.name } });
    }),
  );

  // List a salon's services. priceRial is BigInt in the domain; map to the
  // client-facing shape (number) so the JSON response serializes cleanly.
  router.get(
    '/salons/:id/services',
    asyncRoute(async (req, res) => {
      const services_ = await services.serviceCatalog.listServices(req.params.id);
      res.status(200).json({
        services: services_.map((s) => ({
          id: s.id,
          name: s.name,
          durationMinutes: s.durationMin,
          priceRial: Number(s.priceRial),
        })),
      });
    }),
  );

  // Public availability for a service on a date.
  router.get(
    '/salons/:id/availability',
    asyncRoute(async (req, res) => {
      if (!validateRequired(res, req.query as Record<string, unknown>, ['serviceId', 'date'])) {
        return;
      }
      const slots = await services.schedulingEngine.getAvailability({
        salonId: req.params.id,
        serviceId: String(req.query.serviceId),
        date: String(req.query.date),
      });
      res.status(200).json({ slots });
    }),
  );

  // Record a campaign arrival when a visitor lands on the public profile via a
  // URL carrying the campaign source param (e.g. `utm_source=qr`) so scans are
  // countable (Requirements 4.4, 4.5). The event is recorded ONLY when a source
  // is present — the campaign arrival is what we count. Plain visits without a
  // source param are a no-op (204). Accepts the source via `utm_source` (or
  // `source`) from the query string or JSON body.
  router.post(
    '/salons/:id/scan',
    asyncRoute(async (req, res) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const raw =
        req.query.utm_source ??
        req.query.source ??
        body.utm_source ??
        body.source;
      const source =
        raw === undefined || raw === null ? '' : String(raw).trim();
      if (source !== '') {
        await services.qrService.recordScan(req.params.id, source);
      }
      res.status(204).end();
    }),
  );

  return router;
}
