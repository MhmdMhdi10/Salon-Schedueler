/**
 * Feature: salon-booking-system, Property 5: Booking race safety (concurrency)
 *
 * Opt-in, REAL-PostgreSQL variant of Property 5. Where the sibling
 * `booking-race.property.test.ts` simulates the exclusion constraints with a
 * mock Prisma so it can run offline, this test exercises the ACTUAL PostgreSQL
 * `EXCLUDE USING gist` constraints (no mock substituting for the database) plus
 * the engine's bounded-retry rejection path.
 *
 * For N booking attempts submitted concurrently for the one remaining free
 * (Staff_Member, Chair) pair over the same overlapping interval, exactly one is
 * confirmed and all others are rejected.
 *
 * Validates: original R9.5 / remediation R9.1, R9.2, R9.3, R9.4
 *
 * Prerequisites (opt-in):
 *   - DATABASE_URL must be set (pointing to a PostgreSQL database)
 *   - Migrations applied (prisma migrate deploy): btree_gist + the
 *     no_staff_overlap / no_chair_overlap exclusion constraints must be present
 *
 * Gating: this suite runs only when DATABASE_URL is set; otherwise it is reported
 * as skipped (not errored). The PrismaClient and SchedulingEngine are constructed
 * lazily inside beforeAll, so an unset DATABASE_URL can never throw at module load
 * (R9.2 keeps the offline mock-based Property 5 test as the default check).
 */

import { PrismaClient } from '@prisma/client';
import { SchedulingEngine } from './scheduling-engine';
import type { BookingRequest, BookingResult } from './scheduling-engine';

// Run the DB-dependent suite only when a database is configured; otherwise skip it.
const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

/** Build a time-only Date (as Prisma stores @db.Time at epoch, UTC hours). */
function timeDate(hours: number, minutes: number): Date {
  const d = new Date('1970-01-01T00:00:00.000Z');
  d.setUTCHours(hours, minutes, 0, 0);
  return d;
}

// A date whose UTC weekday is used to seed working hours. The engine derives the
// weekday from the booking date via getUTCDay(), so we compute it the same way.
const DATE = (() => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 2);
  return date.toISOString().slice(0, 10);
})();
const WEEKDAY = new Date(`${DATE}T00:00:00Z`).getUTCDay();
const START_AT = `${DATE}T10:00:00.000Z`;

// The number of concurrent attempts to fan out, exercised across a few values.
const CONCURRENCY_LEVELS = [3, 5, 8] as const;
const MAX_CONCURRENT = Math.max(...CONCURRENCY_LEVELS);

// A per-run unique suffix so re-runs (or a crashed prior run) never collide on the
// salon qr_token / customer phone unique constraints.
const RUN = Date.now().toString(36);

describeIfDb(
  'Property 5 (real PostgreSQL): booking race safety [opt-in: requires DATABASE_URL]',
  () => {
    // Constructed lazily inside beforeAll so module load never instantiates a
    // Prisma client when DATABASE_URL is unset.
    let prisma: PrismaClient;
    let engine: SchedulingEngine;

    // Seeded entities that make EXACTLY ONE free (staff, chair) pair for the slot.
    let salonId: string;
    let staffId: string;
    let chairId: string;
    let serviceId: string;
    const customerIds: string[] = [];

    /** Remove notification logs + appointments created during a race run. */
    async function clearAppointments(): Promise<void> {
      const appts = await prisma.appointment.findMany({
        where: { salonId },
        select: { id: true },
      });
      const ids = appts.map((a) => a.id);
      if (ids.length > 0) {
        await prisma.notificationLog.deleteMany({ where: { appointmentId: { in: ids } } });
        await prisma.payment.deleteMany({ where: { appointmentId: { in: ids } } });
      }
      await prisma.appointment.deleteMany({ where: { salonId } });
    }

    beforeAll(async () => {
      prisma = new PrismaClient();
      engine = new SchedulingEngine(prisma);

      const salon = await prisma.salon.create({
        data: { name: 'Race Salon', qrToken: `race-${RUN}`, timezone: 'Asia/Tehran' },
      });
      salonId = salon.id;

      // Exactly ONE staff member (the "last pair").
      const staff = await prisma.staffMember.create({
        data: { salonId, fullName: 'Solo Staff', role: 'Stylist', active: true },
      });
      staffId = staff.id;

      // Exactly ONE chair (the "last pair").
      const chair = await prisma.chair.create({
        data: { salonId, name: 'Solo Chair', active: true },
      });
      chairId = chair.id;

      // A deposit-free service (so bookings confirm immediately) with no required
      // equipment (so every active chair is compatible).
      const service = await prisma.service.create({
        data: {
          salonId,
          name: 'Haircut',
          durationMin: 30,
          bufferMin: 5,
          priceRial: BigInt(500000),
          requiresDeposit: false,
          depositRial: null,
        },
      });
      serviceId = service.id;

      // Map the single staff member to the service.
      await prisma.serviceStaff.create({ data: { serviceId, staffMemberId: staffId } });

      // Staff + chair working hours covering the target weekday/time window.
      await prisma.workingHours.createMany({
        data: [
          {
            ownerKind: 'staff',
            ownerId: staffId,
            weekday: WEEKDAY,
            startTime: timeDate(8, 0),
            endTime: timeDate(20, 0),
          },
          {
            ownerKind: 'chair',
            ownerId: chairId,
            weekday: WEEKDAY,
            startTime: timeDate(8, 0),
            endTime: timeDate(20, 0),
          },
        ],
      });

      // A pool of distinct customers, one per concurrent attempt.
      for (let i = 0; i < MAX_CONCURRENT; i++) {
        const customer = await prisma.customer.create({
          data: { phone: `race-${RUN}-${i}`, fullName: `Racer ${i}`, noShowCount: 0 },
        });
        customerIds.push(customer.id);
      }
    }, 30000);

    afterEach(async () => {
      await clearAppointments();
    });

    afterAll(async () => {
      // Clean up ALL created rows in reverse FK order, then disconnect (R9.4).
      await clearAppointments();
      await prisma.serviceStaff.deleteMany({ where: { serviceId } });
      await prisma.workingHours.deleteMany({ where: { ownerId: { in: [staffId, chairId] } } });
      await prisma.service.deleteMany({ where: { salonId } });
      await prisma.chair.deleteMany({ where: { salonId } });
      await prisma.staffMember.deleteMany({ where: { salonId } });
      await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
      await prisma.salon.deleteMany({ where: { id: salonId } });
      await prisma.$disconnect();
    }, 30000);

    it.each(CONCURRENCY_LEVELS)(
      'fires %i concurrent bookings at the last free pair: exactly one confirmed, the rest rejected (R9.1, R9.3, R9.4)',
      async (n) => {
        const requests: BookingRequest[] = [];
        for (let i = 0; i < n; i++) {
          requests.push({
            salonId,
            serviceId,
            startAt: START_AT,
            customerId: customerIds[i],
            source: 'web',
          });
        }

        // Fire all attempts concurrently against the real database. The Postgres
        // EXCLUDE constraints serialize the inserts; the engine catches the
        // exclusion violation (or sees the committed winner) and rejects the rest.
        const settled = await Promise.allSettled(requests.map((req) => engine.book(req)));

        const outcomes: BookingResult[] = settled.map((r) => {
          if (r.status === 'fulfilled') {
            return r.value;
          }
          // A thrown error (rather than a 'rejected' BookingResult) is unexpected:
          // surface it so the failing example shows the real cause.
          const reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
          throw new Error(`book() threw unexpectedly: ${reason}`);
        });

        const accepted = outcomes.filter((o) => o.status === 'pending');
        const rejected = outcomes.filter((o) => o.status === 'rejected');

        // Exactly one acceptance (created as pending); everyone else is rejected (R9.1, original R9.5).
        expect(accepted).toHaveLength(1);
        expect(rejected).toHaveLength(n - 1);

        // Rejections carry a booking-domain reason (lost the race or no pair free).
        for (const r of rejected) {
          if (r.status === 'rejected') {
            expect(['no_availability', 'slot_unavailable']).toContain(r.reason);
          }
        }

        // The single acceptance reserves the only available staff + chair.
        if (accepted[0].status === 'pending') {
          expect(accepted[0].appointment.staffMemberId).toBe(staffId);
          expect(accepted[0].appointment.chairId).toBe(chairId);
        }

        // The real exclusion constraints leave exactly one reserving row (pending/
        // held/confirmed) for the pair over the overlapping interval (R9.3, R9.4).
        const persisted = await prisma.appointment.findMany({
          where: { salonId, status: { in: ['pending', 'held', 'confirmed'] } },
        });
        expect(persisted).toHaveLength(1);
      },
      30000,
    );
  },
);
