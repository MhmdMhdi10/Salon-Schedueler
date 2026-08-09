import { Router, type RequestHandler } from 'express';
import type { Services } from '../app.js';
import type { BotPlatform } from '../../bots/index.js';
import { createRateLimit } from '../middleware/rate-limit.js';

/**
 * Public bot webhook routes (Requirements 1.1, 1.6, 8.1).
 *
 * - POST /bots/telegram/:secret
 * - POST /bots/bale/:secret
 *
 * Mounted under `/api` WITHOUT `requireAuth`: the messaging platform calls these
 * directly, so they cannot carry a user access token. Instead they are guarded
 * by a webhook-secret path segment compared against `config.botWebhookSecret`.
 * Only a caller that knows the secret (i.e. the configured platform) reaches the
 * dispatch path; a mismatched secret is rejected with 403 and never dispatched.
 *
 * On a valid secret the route ALWAYS answers 200 — even when internal parsing or
 * dispatch fails — so the messaging platform does not retry-storm the webhook
 * (Requirement 1.6). `Bot_Service.handleUpdate` catches its own errors; the
 * route additionally guards against any unexpected throw so 200 is guaranteed.
 *
 * The webhook secret is runtime configuration read from the environment; it is
 * never logged here (Requirement 8.1).
 */
export function botRouter(services: Services, webhookSecret?: string): Router {
  const router = Router();
  // The secret is intentionally in the URL, so rate-limit guesses before they
  // reach the bot dispatcher. Valid webhook traffic remains well below this cap.
  const webhookLimit = createRateLimit({
    name: 'bot-webhook-ip',
    max: 60,
    windowMs: 60_000,
  });

  const handle = (platform: BotPlatform): RequestHandler => {
    return (req, res) => {
      // Reject when no secret is configured, or the path secret does not match.
      // A constant 403 (no body detail) avoids leaking whether a secret is set.
      if (!webhookSecret || req.params.secret !== webhookSecret) {
        res.status(403).json({ code: 'FORBIDDEN' });
        return;
      }

      // Valid secret: dispatch and ALWAYS answer 200 regardless of the outcome.
      // handleUpdate never throws, but guard anyway so a 200 is guaranteed.
      void services.botService.handleUpdate(platform, req.body).catch(() => {
        // Swallowed: errors are logged inside Bot_Service; the platform must
        // still receive 200 to avoid retry storms (Requirement 1.6).
      });
      res.status(200).json({ ok: true });
    };
  };

  router.post('/bots/telegram/:secret', webhookLimit, handle('telegram'));
  router.post('/bots/bale/:secret', webhookLimit, handle('bale'));

  return router;
}
