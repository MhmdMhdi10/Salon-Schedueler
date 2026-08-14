import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { sendDomainError } from '../../http/error-mapping.js';

/**
 * Wrap an async route handler so a rejected promise is mapped to a stable error
 * response instead of crashing the process. Express 4 does not await handlers, so
 * thrown/rejected domain errors must be caught explicitly (Requirement 2.5).
 */
export function asyncRoute(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch((err) => sendDomainError(res, err));
  };
}

/**
 * Return the first required field that is missing/empty from `source`, or null if
 * all are present. Used to enforce 400 `VALIDATION_ERROR` on bad input.
 */
export function firstMissingField(
  source: Record<string, unknown> | undefined,
  fields: string[],
): string | null {
  for (const field of fields) {
    const value = source?.[field];
    if (value === undefined || value === null || value === '') {
      return field;
    }
  }
  return null;
}

/**
 * Validate that required fields are present; if not, respond 400 `VALIDATION_ERROR`
 * and return false so the caller can stop (Requirement 2.5 validation rule).
 */
export function validateRequired(
  res: Response,
  source: Record<string, unknown> | undefined,
  fields: string[],
): boolean {
  const missing = firstMissingField(source, fields);
  if (missing !== null) {
    res.status(400).json({ code: 'VALIDATION_ERROR', field: missing });
    return false;
  }
  return true;
}
