import type { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';

export type BookingAbuseCode =
  | 'BOT_DETECTED'
  | 'DUPLICATE_BOOKING'
  | 'BOOKING_LIMIT'
  | 'INVALID_IDEMPOTENCY_KEY';

export class BookingAbuseError extends Error {
  constructor(
    public readonly code: BookingAbuseCode,
    message: string,
  ) {
    super(message);
    this.name = 'BookingAbuseError';
  }
}

export interface BookingAbuseInput {
  customerId: string;
  salonId: string;
  serviceId: string;
  startAt: string;
  ip: string;
  idempotencyKey?: string;
  honeypot?: unknown;
}

interface RecentBooking {
  fingerprint: string;
  expiresAt: number;
}

const ACTIVE_STATUSES = ['pending', 'held', 'confirmed'] as const;
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;
const MAX_ACTIVE_BOOKINGS_PER_DAY = 8;

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isValidIdempotencyKey(value: string): boolean {
  return /^[A-Za-z0-9._~-]{8,128}$/.test(value);
}

/**
 * Booking-level abuse checks that complement the HTTP rate limiter:
 * honeypot rejection, duplicate intent suppression, and a small per-customer
 * active-booking cap. The database check protects against a customer bypassing
 * the in-process map with a fresh browser or another API instance.
 */
export class BookingAbuseGuard {
  private readonly recent = new Map<string, RecentBooking>();

  constructor(private readonly prisma: PrismaClient) {}

  async check(input: BookingAbuseInput): Promise<void> {
    if (typeof input.honeypot === 'string' && input.honeypot.trim() !== '') {
      throw new BookingAbuseError('BOT_DETECTED', 'Automated booking rejected');
    }

    const idempotencyKey = input.idempotencyKey?.trim();
    if (idempotencyKey && !isValidIdempotencyKey(idempotencyKey)) {
      throw new BookingAbuseError('INVALID_IDEMPOTENCY_KEY', 'Invalid Idempotency-Key');
    }

    const startAt = new Date(input.startAt);
    if (Number.isNaN(startAt.getTime())) {
      // SchedulingEngine will provide the normal availability response; this
      // guard only rejects malformed dates before they reach database queries.
      return;
    }

    const fingerprint = [
      input.customerId,
      input.salonId,
      input.serviceId,
      startAt.toISOString(),
      idempotencyKey ?? '',
    ].join('|');
    const mapKey = idempotencyKey
      ? `idempotency:${hash(idempotencyKey)}`
      : `intent:${hash(fingerprint)}`;
    const now = Date.now();
    const previous = this.recent.get(mapKey);
    if (previous && previous.expiresAt > now) {
      if (previous.fingerprint !== fingerprint && idempotencyKey) {
        // An idempotency key is bound to its first request intent. Reusing it
        // for another slot must never overwrite that binding or bypass replay
        // protection.
        throw new BookingAbuseError(
          'DUPLICATE_BOOKING',
          'Idempotency key was reused for another booking',
        );
      }
      throw new BookingAbuseError('DUPLICATE_BOOKING', 'Duplicate booking request');
    }
    this.recent.set(mapKey, { fingerprint, expiresAt: now + IDEMPOTENCY_TTL_MS });
    this.prune(now);

    const dayStart = new Date(startAt);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const activeCount = await this.prisma.appointment.count({
      where: {
        customerId: input.customerId,
        salonId: input.salonId,
        status: { in: [...ACTIVE_STATUSES] as any },
        startAt: { gte: dayStart, lt: dayEnd },
      },
    });
    if (activeCount >= MAX_ACTIVE_BOOKINGS_PER_DAY) {
      throw new BookingAbuseError('BOOKING_LIMIT', 'Daily booking limit reached');
    }

    // Exact duplicate intent is rejected even when the salon has several chairs
    // and the scheduler could otherwise assign a second resource to it.
    const duplicate = await this.prisma.appointment.findFirst({
      where: {
        customerId: input.customerId,
        salonId: input.salonId,
        serviceId: input.serviceId,
        startAt,
        status: { in: [...ACTIVE_STATUSES] as any },
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new BookingAbuseError('DUPLICATE_BOOKING', 'Appointment already exists');
    }
  }

  private prune(now: number): void {
    for (const [key, value] of this.recent) {
      if (value.expiresAt <= now) this.recent.delete(key);
    }
    if (this.recent.size > 20_000) {
      const oldest = [...this.recent.entries()]
        .sort(([, a], [, b]) => a.expiresAt - b.expiresAt)
        .slice(0, this.recent.size - 20_000);
      for (const [key] of oldest) this.recent.delete(key);
    }
  }
}
