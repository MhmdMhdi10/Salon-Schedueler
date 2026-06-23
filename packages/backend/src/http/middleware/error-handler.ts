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
  // eslint-disable-next-line no-console
  console.error('[http] unhandled error:', err);
  if (res.headersSent) {
    return;
  }
  res.status(500).json({ code: 'INTERNAL' });
};
