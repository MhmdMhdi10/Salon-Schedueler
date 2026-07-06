import { Router } from 'express';
import { RegisterSalonSchema } from '@salon/shared';
import type { Services } from '../app.js';
import { asyncRoute } from './route-helpers.js';

/**
 * True when an error is a Prisma unique-constraint violation (P2002). The owner
 * login `phone` on staff_member is UNIQUE, so a phone already registered to
 * another staff member surfaces here and is mapped to 409 PHONE_TAKEN.
 */
const isUniqueViolation = (err: unknown): boolean =>
  typeof err === 'object' &&
  err !== null &&
  (err as { code?: string }).code === 'P2002';

/**
 * Public salon self-registration (no authentication).
 *
 * A salon owner signs themselves up from the marketing landing: this creates
 * the salon, its Owner staff member (whose login `phone` lets them sign in via
 * OTP and receive an Owner token scoped to the new salon), starts the free
 * trial, and provisions the optional onboarding answers (brand accent,
 * services, chairs) so the panel is pre-filled.
 *
 *   POST /register/salon  -> 201 { salonId, salonName }
 *
 * The only required inputs are `salonName`, `ownerName` and `phone`; every other
 * answer is optional so the questionnaire can be skipped. A phone already in use
 * by another staff member yields 409 PHONE_TAKEN; invalid input yields 400.
 */
export function registrationRouter(services: Services): Router {
  const router = Router();

  router.post(
    '/register/salon',
    asyncRoute(async (req, res) => {
      const parsed = RegisterSalonSchema.safeParse(req.body);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        res.status(400).json({
          code: 'VALIDATION_ERROR',
          field: first?.path.join('.') ?? undefined,
        });
        return;
      }

      const input = parsed.data;

      try {
        const { salon } = await services.salonRegistration.registerSalon({
          salonName: input.salonName,
          ownerName: input.ownerName,
          phone: input.phone,
          timezone: input.timezone,
          brandAccent: input.brandAccent ?? null,
          services: input.services,
          chairCount: input.chairCount,
        });

        // Start the free trial so the owner can use the panel immediately. The
        // salon already exists; if this ever failed the owner could still sign
        // in and the subscription would simply read `expired` until purchase.
        await services.subscriptionService.startTrial(salon.id);

        res.status(201).json({ salonId: salon.id, salonName: salon.name });
      } catch (err) {
        if (isUniqueViolation(err)) {
          res.status(409).json({ code: 'PHONE_TAKEN', field: 'phone' });
          return;
        }
        throw err;
      }
    }),
  );

  // Pre-flight phone-availability check for the registration wizard. Lets the
  // owner learn a phone is already registered AT THE PHONE FIELD (Step 1) rather
  // than after Submit bounces them back from Step 3. Public — no auth.
  router.get(
    '/register/check-phone',
    asyncRoute(async (req, res) => {
      const phone = String(req.query.phone ?? '').trim();
      if (!phone) {
        res.status(400).json({ code: 'VALIDATION_ERROR', field: 'phone' });
        return;
      }
      const taken = await services.salonRegistration.isPhoneTaken(phone);
      res.status(200).json({ available: !taken });
    }),
  );

  return router;
}
