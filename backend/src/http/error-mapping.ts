import type { Response } from 'express';
import { AuthError } from '../auth/index.js';
import { RegistrationError } from '../registration/index.js';
import { ValidationError } from '../catalog/validation-error.js';
import { BookingAbuseError } from '../security/booking-abuse-guard.js';
import { BookingConflictError } from '../app/appointment-management.js';
import { AppointmentStateError, RescheduleError } from '../scheduling/scheduling-engine.js';
import { PlatformAdminError } from '../platform-admin/services/index.js';
import { ReferralConflictError } from '../referral/services/index.js';
import { isE2EQuietLogs } from '../common/logging.js';

/**
 * A domain error mapped to an HTTP status and a stable, client-facing error code.
 */
export interface MappedError {
  status: number;
  code: string;
}

/**
 * Map a thrown domain error to the original design's stable error code + HTTP
 * status (Requirement 2.5). Reuses the existing error classes so client messages
 * stay consistent. Unknown errors collapse to 500 `INTERNAL` without leaking
 * internals.
 *
 * | Condition                | Status | Code                  |
 * | ------------------------ | ------ | --------------------- |
 * | OTP expired              | 401    | OTP_EXPIRED           |
 * | OTP wrong / no active    | 401    | OTP_INVALID           |
 * | Invalid refresh token    | 401    | INVALID_TOKEN         |
 * | Malformed QR             | 400    | QR_MALFORMED          |
 * | Unregistered QR          | 404    | QR_UNREGISTERED       |
 * | Invalid service input    | 400    | VALIDATION_ERROR      |
 * | Anything else            | 500    | INTERNAL              |
 */
export function mapDomainError(err: unknown): MappedError {
  const domainCode = err instanceof Error ? err.message : '';
  if (typeof domainCode === 'string' && domainCode.startsWith('DEPOSIT_')) {
    if (domainCode === 'DEPOSIT_RECEIPT_NOT_FOUND') {
      return { status: 404, code: domainCode };
    }
    const conflictCodes = new Set([
      'DEPOSIT_HOLD_EXPIRED',
      'DEPOSIT_RECEIPT_ALREADY_REVIEWED',
      'DEPOSIT_CARD_NOT_CONFIGURED',
      'MANUAL_DEPOSIT_NOT_ENABLED',
    ]);
    return { status: conflictCodes.has(domainCode) ? 409 : 400, code: domainCode };
  }
  if (domainCode === 'MANUAL_DEPOSIT_NOT_ENABLED') {
    return { status: 409, code: domainCode };
  }
  if (domainCode === 'APPOINTMENT_NOT_FOUND' || domainCode === 'SALON_NOT_FOUND') {
    return { status: 404, code: domainCode };
  }

  if (err instanceof ReferralConflictError) {
    return { status: 409, code: 'REFERRAL_EXISTS' };
  }

  if (err instanceof BookingAbuseError) {
    switch (err.code) {
      case 'BOT_DETECTED':
        return { status: 403, code: 'AUTOMATION_BLOCKED' };
      case 'BOOKING_LIMIT':
        return { status: 429, code: 'BOOKING_LIMIT_REACHED' };
      case 'INVALID_IDEMPOTENCY_KEY':
        return { status: 400, code: 'INVALID_IDEMPOTENCY_KEY' };
      case 'DUPLICATE_BOOKING':
        return { status: 409, code: 'DUPLICATE_BOOKING' };
    }
  }

  if (err instanceof BookingConflictError) {
    return { status: 409, code: 'BOOKING_SLOT_UNAVAILABLE' };
  }

  if (err instanceof AppointmentStateError) {
    return { status: 409, code: 'APPOINTMENT_NOT_PENDING' };
  }

  if (err instanceof RescheduleError) {
    const status =
      err.code === 'APPOINTMENT_NOT_FOUND'
        ? 404
        : err.code === 'RESCHEDULE_INVALID_START'
          ? 400
          : 409;
    return { status, code: err.code };
  }

  if (err instanceof AuthError) {
    switch (err.code) {
      case 'OTP_EXPIRED':
        return { status: 401, code: 'OTP_EXPIRED' };
      case 'OTP_MISMATCH':
      case 'NO_OTP':
        return { status: 401, code: 'OTP_INVALID' };
      case 'OTP_DELIVERY_FAILED':
        return { status: 502, code: 'OTP_DELIVERY_FAILED' };
      case 'INVALID_TOKEN':
        return { status: 401, code: 'INVALID_TOKEN' };
      default:
        return { status: 401, code: 'UNAUTHORIZED' };
    }
  }

  if (err instanceof RegistrationError) {
    if (err.code === 'QR_MALFORMED') {
      return { status: 400, code: 'QR_MALFORMED' };
    }
    return { status: 404, code: 'QR_UNREGISTERED' };
  }

  if (err instanceof ValidationError) {
    return { status: 400, code: 'VALIDATION_ERROR' };
  }

  if (err instanceof PlatformAdminError) {
    return {
      status: err.code === 'NOT_FOUND' ? 404 : 409,
      code: err.code,
    };
  }

  return { status: 500, code: 'INTERNAL' };
}

/**
 * Map a thrown domain error and write it to the response. Unexpected (500) errors
 * are logged so they remain observable without exposing internals to the client.
 */
export function sendDomainError(res: Response, err: unknown): void {
  const mapped = mapDomainError(err);
  if (mapped.status >= 500 && !isE2EQuietLogs()) {
    // eslint-disable-next-line no-console
    console.error('[http] unhandled domain error:', err);
  }
  res.status(mapped.status).json({ code: mapped.code });
}
