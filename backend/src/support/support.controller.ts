import { Router } from 'express';
import type { Services } from '../http/app.js';
import { asyncRoute } from '../common/http/route-helpers.js';

const allowedStatuses = new Set(['open', 'triaged', 'in_progress', 'resolved', 'closed']);
const allowedPriorities = new Set(['low', 'normal', 'high', 'urgent']);
const screenshotMime = new Set(['image/jpeg', 'image/png', 'image/webp']);

function decodeScreenshot(value: unknown) {
  if (!value || typeof value !== 'object') return undefined;
  const row = value as Record<string, unknown>;
  if (typeof row.name !== 'string' || typeof row.mime !== 'string' || typeof row.dataBase64 !== 'string') {
    return null;
  }
  if (!screenshotMime.has(row.mime) || row.name.length > 120 || row.dataBase64.length > 7_200_000) return null;
  const data = Buffer.from(row.dataBase64, 'base64');
  if (data.length === 0 || data.length > 5 * 1024 * 1024) return null;
  return { name: row.name, mime: row.mime as 'image/jpeg' | 'image/png' | 'image/webp', data };
}

export function supportRouter(services: Services): Router {
  const router = Router();

  router.post('/support/tickets', asyncRoute(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (message.length < 5 || message.length > 4000) {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'message' });
      return;
    }
    const screenshot = body.screenshot === undefined ? undefined : decodeScreenshot(body.screenshot);
    if (screenshot === null) {
      res.status(400).json({ code: 'VALIDATION_ERROR', field: 'screenshot' });
      return;
    }
    const principal = req.principal!;
    const ticket = await services.supportTicketService.create({
      reporterId: principal.role ? undefined : principal.id,
      reporterStaffId: principal.role && principal.role !== 'PlatformAdmin' ? (principal.staffMemberId ?? principal.id) : undefined,
      reporterRole: principal.role ?? 'Customer',
      salonId: principal.salonId,
      page: typeof body.page === 'string' ? body.page.slice(0, 300) : undefined,
      action: typeof body.action === 'string' ? body.action.slice(0, 300) : undefined,
      message,
      errorCode: typeof body.errorCode === 'string' ? body.errorCode.slice(0, 120) : undefined,
      requestId: req.get('X-Request-Id') ?? undefined,
      userAgent: req.get('User-Agent')?.slice(0, 500),
      browser: typeof body.browser === 'string' ? body.browser.slice(0, 120) : undefined,
      device: typeof body.device === 'string' ? body.device.slice(0, 120) : undefined,
      screenshot,
    });
    res.status(201).json({ ticket });
  }));

  router.get('/support/tickets/mine', asyncRoute(async (req, res) => {
    const principal = req.principal!;
    const tickets = await services.supportTicketService.listMine(
      principal.role && principal.role !== 'PlatformAdmin'
        ? { reporterStaffId: principal.staffMemberId ?? principal.id }
        : { reporterId: principal.id },
    );
    res.status(200).json({ tickets });
  }));

  return router;
}

export class SupportController {
  constructor(private readonly services: Services) {}
  router(): Router {
    return supportRouter(this.services);
  }
}

export { allowedStatuses, allowedPriorities };
