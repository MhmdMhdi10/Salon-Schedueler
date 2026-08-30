import { Router } from 'express';
import { RegisterSalonSchema } from '@salon/shared';
import type { Services } from '../../http/app.js';
import { asyncRoute } from '../../common/http/route-helpers.js';
import { createRateLimit, phoneRateLimitKey } from '../../http/middleware/rate-limit.js';
import { isE2EQuietLogs } from '../../common/logging.js';

/**
 * True when an error is a Prisma unique-constraint violation (P2002). Kept for
 * compatibility with older database clients; phone is no longer globally unique.
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
 * answer is optional so the questionnaire can be skipped. A phone may belong to
 * another salon; invalid input yields 400.
 */
export function registrationRouter(services: Services): Router {
  const router = Router();

  // The dev Cucumber matrix creates one isolated salon per scenario. Keep the
  // production abuse limit unchanged, while allowing the dev container to opt
  // into a larger test-only bucket through compose configuration.
  const configuredDevLimit = Number(process.env.E2E_REGISTRATION_IP_LIMIT);
  const registrationIpMax =
    process.env.NODE_ENV === 'development' &&
    Number.isInteger(configuredDevLimit) &&
    configuredDevLimit > 0
      ? configuredDevLimit
      : 15;

  const registrationIpLimit = createRateLimit({
    name: 'salon-registration-ip',
    // Registration is expensive and protected by phone uniqueness/OTP, but
    // legitimate teams may create several test or branch salons from one
    // office IP. Keep the hourly cap meaningful without blocking that flow.
    max: registrationIpMax,
    windowMs: 60 * 60_000,
  });
  const checkPhoneLimit = createRateLimit({
    name: 'registration-phone-check',
    max: 20,
    windowMs: 10 * 60_000,
    keyGenerator: phoneRateLimitKey,
  });

  router.post(
    '/register/salon',
    registrationIpLimit,
    asyncRoute(async (req, res) => {
      if (typeof req.body?.website === 'string' && req.body.website.trim() !== '') {
        res.status(403).json({ code: 'AUTOMATION_BLOCKED' });
        return;
      }
      const parsed = RegisterSalonSchema.safeParse(req.body);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        res.status(400).json({
          code: 'VALIDATION_ERROR',
          // ZodError always contains at least one issue for a failed parse.
          field: first.path.join('.'),
        });
        return;
      }

      const input = parsed.data;

      try {
        const { salon } = await services.salonRegistration.registerSalon({
          salonName: input.salonName,
          ownerName: input.ownerName,
          phone: input.phone,
          businessType: input.businessType,
          businessTypes: input.businessTypes,
          specialties: input.specialties,
          timezone: input.timezone,
          brandAccent: input.brandAccent ?? null,
          workMode: input.workMode,
          services: input.services,
          teamMembers: input.teamMembers,
          chairCount: input.chairCount,
        });

        // Start the free trial so the owner can use the panel immediately. The
        // salon already exists; if this ever failed the owner could still sign
        // in and the subscription would simply read `expired` until purchase.
        await services.subscriptionService.startTrial(salon.id);

        if (input.referralToken && services.referralService) {
          await services.referralService.linkSalon(input.referralToken, salon.id).catch((error) => {
            if (!isE2EQuietLogs()) {
              console.warn('[referral] could not link salon signup:', error);
            }
          });
        }

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
    checkPhoneLimit,
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

export class RegistrationController {
  public constructor(private readonly services: Services) {}

  public router(): Router {
    return registrationRouter(this.services);
  }
}
