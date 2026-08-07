import { Router, type RequestHandler } from 'express';
import type { Services } from '../app.js';
import { asyncRoute, validateRequired } from './route-helpers.js';
import { createRateLimit } from '../middleware/rate-limit.js';

/**
 * Public salon routes (Requirement 2.6, 2.7 / original R7, R8). These are
 * publicly accessible without authentication; `optionalAuth` attaches the
 * principal when a token is present but never rejects.
 *
 * - GET /salons/by-qr/:payload          -> 200 { salon: { id, name, brandAccent } }
 * - GET /salons/:id/brand               -> 200 { brandAccent }
 * - GET /salons/:id/services            -> 200 { services: [...] }
 * - GET /salons/:id/availability?serviceId=&date= -> 200 { slots: [...] }
 *
 * QR resolution returns distinct codes: QR_MALFORMED (400) vs QR_UNREGISTERED
 * (404) so clients can show distinct messages (Requirement 2.6).
 */
export function salonRouter(services: Services, optionalAuth: RequestHandler): Router {
  const router = Router();

  const publicReadLimit = createRateLimit({
    name: 'public-salon-read',
    max: 180,
    windowMs: 60_000,
  });
  const availabilityLimit = createRateLimit({
    name: 'public-availability',
    max: 90,
    windowMs: 60_000,
  });
  const scanLimit = createRateLimit({
    name: 'campaign-scan',
    max: 60,
    windowMs: 60_000,
  });

  router.use(optionalAuth);

  // Resolve a scanned QR payload to a salon (and, for a stylist QR, the named
  // staff member). The route param is URL-decoded by Express; SalonRegistration
  // distinguishes malformed from unregistered.
  router.get(
    '/salons/by-qr/:payload',
    publicReadLimit,
    asyncRoute(async (req, res) => {
      const { salon, staff } = await services.salonRegistration.resolveQr(
        req.params.payload,
      );
      // brandAccent is additive (signature-ui-system R4.1/R4.2): anonymous
      // storefront visitors receive the salon's accent so the funnel can theme
      // itself; null = signature default. Existing { id, name } shape preserved.
      const body: {
        salon: { id: string; name: string; brandAccent: string | null };
        staff?: { id: string; fullName: string | null };
      } = {
        salon: { id: salon.id, name: salon.name, brandAccent: salon.brandAccent ?? null },
      };
      if (staff) {
        body.staff = { id: staff.id, fullName: staff.fullName };
      }
      res.status(200).json(body);
    }),
  );

  // Public read of a salon's storefront Brand_Accent by id (signature-ui-system
  // R4.1/R4.2). The booking funnel resolves a salon by id, so it needs a by-id
  // accent read to theme the storefront for any (anonymous) visitor. null =
  // signature default.
  router.get(
    '/salons/:id/brand',
    publicReadLimit,
    asyncRoute(async (req, res) => {
      // Additive: `name` lets a deep-linked funnel show the salon as the
      // primary brand mark (R4.5) without a second request. Existing
      // `{ brandAccent }` consumers are unaffected.
      const { name, brandAccent } =
        await services.salonRegistration.getSalonPublicBrand(req.params.id);
      res.status(200).json({ brandAccent, name });
    }),
  );

  // List a salon's bookable stylists for the public booking funnel's stylist
  // picker (id + display name + role). Public — no authentication required.
  router.get(
    '/salons/:id/stylists',
    publicReadLimit,
    asyncRoute(async (req, res) => {
      const stylists = await services.resourceRegistration.listBookableStaff(
        req.params.id,
      );
      res.status(200).json({
        stylists: stylists.map((s) => ({
          id: s.id,
          fullName: s.fullName,
          role: s.role,
        })),
      });
    }),
  );

  // Public booking horizon used by the date picker. Enforcement also lives in
  // SchedulingEngine, so a crafted request cannot bypass this rule.
  router.get(
    '/salons/:id/booking-policy',
    publicReadLimit,
    asyncRoute(async (req, res) => {
      const bookingWindowDays = await services.availabilityConfig.getBookingWindowDays(req.params.id);
      res.status(200).json({ bookingWindowDays });
    }),
  );

  // List a salon's services. priceRial is BigInt in the domain; map to the
  // client-facing shape (number) so the JSON response serializes cleanly.
  router.get(
    '/salons/:id/services',
    publicReadLimit,
    asyncRoute(async (req, res) => {
      const services_ = await services.serviceCatalog.listServices(req.params.id);
      res.status(200).json({
        services: services_.map((s) => ({
          id: s.id,
          name: s.name,
          durationMinutes: s.durationMin,
          bufferMinutes: s.bufferMin,
          priceRial: Number(s.priceRial),
          // Additive deposit fields so the confirm step can show the deposit
          // notice (with its amount) ONLY for services that actually require
          // one, instead of a blanket payment claim (ui-ux §12 honesty).
          requiresDeposit: s.requiresDeposit,
          depositRial: s.depositRial != null ? Number(s.depositRial) : null,
          staffIds: s.serviceStaff.map((mapping) => mapping.staffMemberId),
        })),
      });
    }),
  );

  // Public availability for a service on a date.
  router.get(
    '/salons/:id/availability',
    availabilityLimit,
    asyncRoute(async (req, res) => {
      if (!validateRequired(res, req.query as Record<string, unknown>, ['serviceId', 'date'])) {
        return;
      }
      const slots = await services.schedulingEngine.getAvailability({
        salonId: req.params.id,
        serviceId: String(req.query.serviceId),
        date: String(req.query.date),
        // Optional stylist filter (R14.3): `&staffId=` narrows the slots to
        // ones that specific staff member can personally serve.
        staffId: req.query.staffId ? String(req.query.staffId) : undefined,
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
    scanLimit,
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
