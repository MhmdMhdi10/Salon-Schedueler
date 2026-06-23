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

  return router;
}
