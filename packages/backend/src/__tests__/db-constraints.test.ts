/**
 * Database Constraint Tests — Exclusion constraints for double-resource booking
 *
 * These tests validate PostgreSQL EXCLUDE constraints that prevent overlapping
 * appointments for the same staff member or chair when status is 'held' or 'confirmed'.
 *
 * Requirements: 9.3, 9.4
 *
 * Prerequisites:
 *   - DATABASE_URL must be set (pointing to a PostgreSQL database)
 *   - The database must have migrations applied (prisma migrate deploy)
 *   - The btree_gist extension and exclusion constraints must be in place
 *
 * Gating: These tests are opt-in. They run only when DATABASE_URL is set; otherwise
 * the whole suite is reported as skipped (not errored). The PrismaClient is never
 * constructed at module load — it is created lazily inside the guarded beforeAll, so
 * an unset DATABASE_URL cannot throw a PrismaClientInitializationError at import time.
 */

import { PrismaClient } from '@prisma/client';

// Run the DB-dependent suite only when a database is configured; otherwise skip it.
const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

// Helper to generate a UUID (v4-like) for test data
function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

describeIfDb('database exclusion constraints (opt-in: requires DATABASE_URL)', () => {
  // Constructed lazily inside beforeAll so module load never instantiates a Prisma
  // client when DATABASE_URL is unset.
  let prisma: PrismaClient;

  // Shared test entities
  let salonId: string;
  let staffId1: string;
  let staffId2: string;
  let chairId1: string;
  let chairId2: string;
  let serviceId: string;
  let customerId: string;

  /**
   * Helper to insert an appointment via raw SQL.
   * Uses start_at / end_at; the generated time_range column is computed automatically.
   */
  async function insertAppointment(params: {
    staffMemberId: string;
    chairId: string;
    startAt: Date;
    endAt: Date;
    status: 'held' | 'confirmed' | 'cancelled' | 'no_show' | 'expired' | 'completed';
  }): Promise<string> {
    const id = uuid();
    await prisma.$executeRaw`
      INSERT INTO appointment (id, salon_id, customer_id, staff_member_id, chair_id, service_id, start_at, end_at, status, source, created_at)
      VALUES (
        ${id}::uuid,
        ${salonId}::uuid,
        ${customerId}::uuid,
        ${params.staffMemberId}::uuid,
        ${params.chairId}::uuid,
        ${serviceId}::uuid,
        ${params.startAt}::timestamptz,
        ${params.endAt}::timestamptz,
        ${params.status}::appt_status,
        'web'::appt_source,
        NOW()
      )
    `;
    return id;
  }

  beforeAll(async () => {
    prisma = new PrismaClient();

    // Create dependent entities needed for appointment inserts
    salonId = uuid();
    staffId1 = uuid();
    staffId2 = uuid();
    chairId1 = uuid();
    chairId2 = uuid();
    serviceId = uuid();
    customerId = uuid();

    await prisma.$executeRaw`
      INSERT INTO salon (id, name, qr_token, timezone, created_at)
      VALUES (${salonId}::uuid, 'Test Salon', ${uuid()}, 'Asia/Tehran', NOW())
    `;

    await prisma.$executeRaw`
      INSERT INTO staff_member (id, salon_id, full_name, role, active)
      VALUES
        (${staffId1}::uuid, ${salonId}::uuid, 'Staff One', 'Owner', true),
        (${staffId2}::uuid, ${salonId}::uuid, 'Staff Two', 'Stylist', true)
    `;

    await prisma.$executeRaw`
      INSERT INTO chair (id, salon_id, name, active)
      VALUES
        (${chairId1}::uuid, ${salonId}::uuid, 'Chair A', true),
        (${chairId2}::uuid, ${salonId}::uuid, 'Chair B', true)
    `;

    await prisma.$executeRaw`
      INSERT INTO service (id, salon_id, name, duration_min, buffer_min, price_rial, requires_deposit, deposit_rial)
      VALUES (${serviceId}::uuid, ${salonId}::uuid, 'Haircut', 30, 5, 500000, false, NULL)
    `;

    await prisma.$executeRaw`
      INSERT INTO customer (id, phone, full_name, no_show_count)
      VALUES (${customerId}::uuid, '09121234567', 'Test Customer', 0)
    `;
  });

  afterAll(async () => {
    // Clean up in reverse FK order
    await prisma.$executeRaw`DELETE FROM appointment WHERE salon_id = ${salonId}::uuid`;
    await prisma.$executeRaw`DELETE FROM service WHERE salon_id = ${salonId}::uuid`;
    await prisma.$executeRaw`DELETE FROM chair WHERE salon_id = ${salonId}::uuid`;
    await prisma.$executeRaw`DELETE FROM staff_member WHERE salon_id = ${salonId}::uuid`;
    await prisma.$executeRaw`DELETE FROM customer WHERE id = ${customerId}::uuid`;
    await prisma.$executeRaw`DELETE FROM salon WHERE id = ${salonId}::uuid`;
    await prisma.$disconnect();
  });

  afterEach(async () => {
    // Remove all appointments created during each test
    await prisma.$executeRaw`DELETE FROM appointment WHERE salon_id = ${salonId}::uuid`;
  });

  // ─── Test: Staff overlap constraint (R9.3) ─────────────────────────────────────

  describe('no_staff_overlap exclusion constraint (R9.3)', () => {
    const baseStart = new Date('2025-03-01T10:00:00Z');
    const baseEnd = new Date('2025-03-01T10:35:00Z'); // 30 min + 5 buffer

    it('rejects overlapping appointment for the same staff with status "held"', async () => {
      // First appointment: staff1, chair1, held
      await insertAppointment({
        staffMemberId: staffId1,
        chairId: chairId1,
        startAt: baseStart,
        endAt: baseEnd,
        status: 'held',
      });

      // Second appointment: same staff1, different chair2, overlapping time, held
      await expect(
        insertAppointment({
          staffMemberId: staffId1,
          chairId: chairId2,
          startAt: new Date('2025-03-01T10:10:00Z'), // overlaps [10:00, 10:35)
          endAt: new Date('2025-03-01T10:45:00Z'),
          status: 'held',
        })
      ).rejects.toThrow();
    });

    it('rejects overlapping appointment for the same staff with status "confirmed"', async () => {
      await insertAppointment({
        staffMemberId: staffId1,
        chairId: chairId1,
        startAt: baseStart,
        endAt: baseEnd,
        status: 'confirmed',
      });

      await expect(
        insertAppointment({
          staffMemberId: staffId1,
          chairId: chairId2,
          startAt: new Date('2025-03-01T10:10:00Z'),
          endAt: new Date('2025-03-01T10:45:00Z'),
          status: 'confirmed',
        })
      ).rejects.toThrow();
    });

    it('rejects overlapping when one is "held" and other is "confirmed"', async () => {
      await insertAppointment({
        staffMemberId: staffId1,
        chairId: chairId1,
        startAt: baseStart,
        endAt: baseEnd,
        status: 'held',
      });

      await expect(
        insertAppointment({
          staffMemberId: staffId1,
          chairId: chairId2,
          startAt: new Date('2025-03-01T10:10:00Z'),
          endAt: new Date('2025-03-01T10:45:00Z'),
          status: 'confirmed',
        })
      ).rejects.toThrow();
    });

    it('allows non-overlapping appointments for the same staff', async () => {
      await insertAppointment({
        staffMemberId: staffId1,
        chairId: chairId1,
        startAt: baseStart,
        endAt: baseEnd,
        status: 'confirmed',
      });

      // After the first ends at 10:35
      await expect(
        insertAppointment({
          staffMemberId: staffId1,
          chairId: chairId2,
          startAt: new Date('2025-03-01T10:35:00Z'),
          endAt: new Date('2025-03-01T11:10:00Z'),
          status: 'confirmed',
        })
      ).resolves.toBeDefined();
    });
  });

  // ─── Test: Chair overlap constraint (R9.4) ──────────────────────────────────────

  describe('no_chair_overlap exclusion constraint (R9.4)', () => {
    const baseStart = new Date('2025-03-01T14:00:00Z');
    const baseEnd = new Date('2025-03-01T14:35:00Z');

    it('rejects overlapping appointment for the same chair with status "held"', async () => {
      await insertAppointment({
        staffMemberId: staffId1,
        chairId: chairId1,
        startAt: baseStart,
        endAt: baseEnd,
        status: 'held',
      });

      // Same chair1, different staff2, overlapping time
      await expect(
        insertAppointment({
          staffMemberId: staffId2,
          chairId: chairId1,
          startAt: new Date('2025-03-01T14:10:00Z'),
          endAt: new Date('2025-03-01T14:45:00Z'),
          status: 'held',
        })
      ).rejects.toThrow();
    });

    it('rejects overlapping appointment for the same chair with status "confirmed"', async () => {
      await insertAppointment({
        staffMemberId: staffId1,
        chairId: chairId1,
        startAt: baseStart,
        endAt: baseEnd,
        status: 'confirmed',
      });

      await expect(
        insertAppointment({
          staffMemberId: staffId2,
          chairId: chairId1,
          startAt: new Date('2025-03-01T14:10:00Z'),
          endAt: new Date('2025-03-01T14:45:00Z'),
          status: 'confirmed',
        })
      ).rejects.toThrow();
    });

    it('rejects overlapping when one is "held" and other is "confirmed"', async () => {
      await insertAppointment({
        staffMemberId: staffId1,
        chairId: chairId1,
        startAt: baseStart,
        endAt: baseEnd,
        status: 'held',
      });

      await expect(
        insertAppointment({
          staffMemberId: staffId2,
          chairId: chairId1,
          startAt: new Date('2025-03-01T14:10:00Z'),
          endAt: new Date('2025-03-01T14:45:00Z'),
          status: 'confirmed',
        })
      ).rejects.toThrow();
    });

    it('allows non-overlapping appointments for the same chair', async () => {
      await insertAppointment({
        staffMemberId: staffId1,
        chairId: chairId1,
        startAt: baseStart,
        endAt: baseEnd,
        status: 'confirmed',
      });

      await expect(
        insertAppointment({
          staffMemberId: staffId2,
          chairId: chairId1,
          startAt: new Date('2025-03-01T14:35:00Z'),
          endAt: new Date('2025-03-01T15:10:00Z'),
          status: 'confirmed',
        })
      ).resolves.toBeDefined();
    });
  });

  // ─── Test: Different resources allow overlap ────────────────────────────────────

  describe('overlapping appointments for different staff AND different chairs are allowed', () => {
    it('allows overlapping appointments when staff and chair are both different', async () => {
      const start = new Date('2025-03-01T16:00:00Z');
      const end = new Date('2025-03-01T16:35:00Z');

      await insertAppointment({
        staffMemberId: staffId1,
        chairId: chairId1,
        startAt: start,
        endAt: end,
        status: 'confirmed',
      });

      // Different staff AND different chair — should succeed
      await expect(
        insertAppointment({
          staffMemberId: staffId2,
          chairId: chairId2,
          startAt: start,
          endAt: end,
          status: 'confirmed',
        })
      ).resolves.toBeDefined();
    });
  });

  // ─── Test: Status change frees resource ─────────────────────────────────────────

  describe('status change to cancelled/no_show/expired frees resources', () => {
    const start = new Date('2025-03-01T18:00:00Z');
    const end = new Date('2025-03-01T18:35:00Z');

    it.each(['cancelled', 'no_show', 'expired'] as const)(
      'changing status to "%s" frees the staff and chair for new bookings',
      async (freeingStatus) => {
        // Insert first appointment as confirmed
        const apptId = await insertAppointment({
          staffMemberId: staffId1,
          chairId: chairId1,
          startAt: start,
          endAt: end,
          status: 'confirmed',
        });

        // Attempting overlapping insert should fail while confirmed
        await expect(
          insertAppointment({
            staffMemberId: staffId1,
            chairId: chairId2,
            startAt: start,
            endAt: end,
            status: 'confirmed',
          })
        ).rejects.toThrow();

        // Now change the first appointment's status to free the resource
        await prisma.$executeRaw`
          UPDATE appointment SET status = ${freeingStatus}::appt_status WHERE id = ${apptId}::uuid
        `;

        // Now the same overlapping insert should succeed (staff freed)
        await expect(
          insertAppointment({
            staffMemberId: staffId1,
            chairId: chairId2,
            startAt: start,
            endAt: end,
            status: 'confirmed',
          })
        ).resolves.toBeDefined();
      }
    );

    it.each(['cancelled', 'no_show', 'expired'] as const)(
      'changing status to "%s" frees the chair for new bookings',
      async (freeingStatus) => {
        // Insert first appointment as held
        const apptId = await insertAppointment({
          staffMemberId: staffId1,
          chairId: chairId1,
          startAt: start,
          endAt: end,
          status: 'held',
        });

        // Attempting overlapping chair insert should fail while held
        await expect(
          insertAppointment({
            staffMemberId: staffId2,
            chairId: chairId1,
            startAt: start,
            endAt: end,
            status: 'confirmed',
          })
        ).rejects.toThrow();

        // Change status to free the chair
        await prisma.$executeRaw`
          UPDATE appointment SET status = ${freeingStatus}::appt_status WHERE id = ${apptId}::uuid
        `;

        // Now the same overlapping insert should succeed (chair freed)
        await expect(
          insertAppointment({
            staffMemberId: staffId2,
            chairId: chairId1,
            startAt: start,
            endAt: end,
            status: 'confirmed',
          })
        ).resolves.toBeDefined();
      }
    );
  });
});
