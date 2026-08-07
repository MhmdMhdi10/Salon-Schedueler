import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';

/**
 * Generic fallback error handler.
 *
 * Per-route domain error mapping (OTP_EXPIRED, QR_MALFORMED, VALIDATION_ERROR,
 * BOOKING_* etc.) is added with the route handlers in Task 5. This foundation
 * ensures an unexpected thrown error never crashes the process and is returned
 * as a stable shape without leaking internals.
 */
export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
) => {
  const httpError = err as { status?: unknown; type?: unknown } | null;
  const status =
    typeof httpError?.status === 'number' ? httpError.status : undefined;
  if (status === 413 || httpError?.type === 'entity.too.large') {
    res.status(413).json({ code: 'PAYLOAD_TOO_LARGE' });
    return;
  }
  // Malformed JSON is rejected by express.json before a route handler runs.
  // Keep its public contract identical to route-level validation errors.
  if (status === 400 || httpError?.type === 'entity.parse.failed') {
    res.status(400).json({ code: 'VALIDATION_ERROR' });
    return;
  }
  // eslint-disable-next-line no-console
  console.error('[http] unhandled error:', err);
  if (res.headersSent) {
    return;
  }
  res.status(500).json({ code: 'INTERNAL' });
};
