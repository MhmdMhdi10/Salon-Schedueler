import fc from 'fast-check';
import { SchedulingEngine } from '../scheduling/scheduling-engine';

/**
 * Property Tests — Feature: salon-booking-system
 *
 * Property 18: Preferred-staff preselection
 * **Validates: Requirements 14.3**
 *
 * For any booking where the customer's preferred Staff_Member is mapped to the selected
 * service and is free for the requested Time_Slot, the Booking_System preselects that
 * preferred Staff_Member.
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Helper to create a time-only Date (as Prisma stores @db.Time at epoch) */
function timeDate(hours: number, minutes: number): Date {
  const d = new Date('1970-01-01T00:00:00.000Z');
  d.setUTCHours(hours, minutes, 0, 0);
  return d;
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Generate 2-5 unique staff IDs */
const staffIdsArb = fc.uniqueArray(fc.uuid(), { minLength: 2, maxLength: 5 });

/**
 * Generate booking parameters that are guaranteed to fit within an 8:00-18:00 working day.
 * We generate duration+buffer first, then constrain start hour so occupancy ends by 18:00.
 */
const safeBookingParamsArb = fc.record({
  salonId: fc.uuid(),
  serviceId: fc.uuid(),
  customerId: fc.uuid(),
  chairId: fc.uuid(),
  durationMin: fc.integer({ min: 15, max: 60 }),
  bufferMin: fc.integer({ min: 0, max: 15 }),
  /** Start hour (9-14 to guarantee even 75min occupancy fits within 18:00) */
  startHour: fc.integer({ min: 9, max: 14 }),
  startMinute: fc.constantFrom(0, 15, 30, 45),
}).filter((p) => {
  // Ensure occupancy end <= 18:00
  const totalMinutes = p.startHour * 60 + p.startMinute + p.durationMin + p.bufferMin;
  return totalMinutes <= 18 * 60;
});

// ─── Property 18: Preferred-staff preselection ───────────────────────────────

describe('Feature: salon-booking-system, Property 18: Preferred-staff preselection', () => {
  it('when preferred staff is qualified and free, booking preselects them', async () => {
    await fc.assert(
      fc.asyncProperty(
        safeBookingParamsArb,
        staffIdsArb,
        async (params, staffIds) => {
          // The preferred staff is the last one in the array (to test it gets moved to front)
          const preferredStaffId = staffIds[staffIds.length - 1];

          const startAt = `2024-03-15T${String(params.startHour).padStart(2, '0')}:${String(params.startMinute).padStart(2, '0')}:00.000Z`;

          // All staff are qualified (mapped to the service)
          const serviceStaff = staffIds.map((id) => ({
            serviceId: params.serviceId,
            staffMemberId: id,
          }));

          // Track which staff member was used in the appointment create call
          let createdStaffId: string | null = null;

          const mockPrisma = {
            service: {
              findUnique: jest.fn().mockResolvedValue({
                id: params.serviceId,
                salonId: params.salonId,
                name: 'Test Service',
                durationMin: params.durationMin,
                bufferMin: params.bufferMin,
                priceRial: BigInt(500000),
                requiresDeposit: false,
                depositRial: null,
                serviceStaff,
                serviceEquipment: [],
              }),
            },
            holiday: {
              findFirst: jest.fn().mockResolvedValue(null),
            },
            staffMember: {
              findMany: jest.fn().mockResolvedValue(
                staffIds.map((id) => ({
                  id,
                  salonId: params.salonId,
                  fullName: `Staff-${id.slice(0, 4)}`,
                  role: 'Stylist',
                  active: true,
                })),
              ),
            },
            workingHours: {
              findMany: jest.fn()
                .mockResolvedValueOnce(
                  // Staff working hours — all staff work 8-18 on Friday
                  staffIds.map((id, i) => ({
                    id: `wh-staff-${i}`,
                    ownerKind: 'staff',
                    ownerId: id,
                    weekday: 5, // Friday (2024-03-15)
                    startTime: timeDate(8, 0),
                    endTime: timeDate(18, 0),
                  })),
                )
                .mockResolvedValueOnce([
                  // Chair working hours
                  {
                    id: 'wh-chair-1',
                    ownerKind: 'chair',
                    ownerId: params.chairId,
                    weekday: 5,
                    startTime: timeDate(8, 0),
                    endTime: timeDate(18, 0),
                  },
                ]),
            },
            dayOff: {
              findMany: jest.fn().mockResolvedValue([]),
            },
            chair: {
              findMany: jest.fn().mockResolvedValue([
                {
                  id: params.chairId,
                  salonId: params.salonId,
                  name: 'Chair A',
                  active: true,
                  chairEquipment: [],
                },
              ]),
            },
            chairUnavailable: {
              findMany: jest.fn().mockResolvedValue([]),
            },
            appointment: {
              findMany: jest.fn().mockResolvedValue([]), // No existing appointments
              create: jest.fn().mockImplementation((args: any) => {
                createdStaffId = args.data.staffMemberId;
                return Promise.resolve({
                  id: 'appt-new',
                  ...args.data,
                  createdAt: new Date(),
                });
              }),
            },
          } as any;

          const engine = new SchedulingEngine(mockPrisma);
          const result = await engine.book({
            salonId: params.salonId,
            serviceId: params.serviceId,
            startAt,
            customerId: params.customerId,
            preferredStaffId,
            source: 'web',
          });

          // Property: when preferred staff is qualified and free, they are preselected
          expect(result.status).toBe('confirmed');
          expect(createdStaffId).toBe(preferredStaffId);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('when preferred staff is NOT qualified (not mapped to service), they are not selected', async () => {
    await fc.assert(
      fc.asyncProperty(
        safeBookingParamsArb,
        staffIdsArb,
        fc.uuid(), // A preferred staff ID that is NOT in the service_staff mapping
        async (params, staffIds, unmappedPreferredId) => {
          // Ensure unmappedPreferredId is not in staffIds
          fc.pre(!staffIds.includes(unmappedPreferredId));

          const startAt = `2024-03-15T${String(params.startHour).padStart(2, '0')}:${String(params.startMinute).padStart(2, '0')}:00.000Z`;

          // Only staffIds are qualified for the service (preferred is NOT)
          const serviceStaff = staffIds.map((id) => ({
            serviceId: params.serviceId,
            staffMemberId: id,
          }));

          let createdStaffId: string | null = null;

          const mockPrisma = {
            service: {
              findUnique: jest.fn().mockResolvedValue({
                id: params.serviceId,
                salonId: params.salonId,
                name: 'Test Service',
                durationMin: params.durationMin,
                bufferMin: params.bufferMin,
                priceRial: BigInt(500000),
                requiresDeposit: false,
                depositRial: null,
                serviceStaff,
                serviceEquipment: [],
              }),
            },
            holiday: {
              findFirst: jest.fn().mockResolvedValue(null),
            },
            staffMember: {
              findMany: jest.fn().mockResolvedValue(
                staffIds.map((id) => ({
                  id,
                  salonId: params.salonId,
                  fullName: `Staff-${id.slice(0, 4)}`,
                  role: 'Stylist',
                  active: true,
                })),
              ),
            },
            workingHours: {
              findMany: jest.fn()
                .mockResolvedValueOnce(
                  staffIds.map((id, i) => ({
                    id: `wh-staff-${i}`,
                    ownerKind: 'staff',
                    ownerId: id,
                    weekday: 5,
                    startTime: timeDate(8, 0),
                    endTime: timeDate(18, 0),
                  })),
                )
                .mockResolvedValueOnce([
                  {
                    id: 'wh-chair-1',
                    ownerKind: 'chair',
                    ownerId: params.chairId,
                    weekday: 5,
                    startTime: timeDate(8, 0),
                    endTime: timeDate(18, 0),
                  },
                ]),
            },
            dayOff: {
              findMany: jest.fn().mockResolvedValue([]),
            },
            chair: {
              findMany: jest.fn().mockResolvedValue([
                {
                  id: params.chairId,
                  salonId: params.salonId,
                  name: 'Chair A',
                  active: true,
                  chairEquipment: [],
                },
              ]),
            },
            chairUnavailable: {
              findMany: jest.fn().mockResolvedValue([]),
            },
            appointment: {
              findMany: jest.fn().mockResolvedValue([]),
              create: jest.fn().mockImplementation((args: any) => {
                createdStaffId = args.data.staffMemberId;
                return Promise.resolve({
                  id: 'appt-new',
                  ...args.data,
                  createdAt: new Date(),
                });
              }),
            },
          } as any;

          const engine = new SchedulingEngine(mockPrisma);
          const result = await engine.book({
            salonId: params.salonId,
            serviceId: params.serviceId,
            startAt,
            customerId: params.customerId,
            preferredStaffId: unmappedPreferredId, // Not qualified
            source: 'web',
          });

          // Property: booking still succeeds but with one of the qualified staff
          expect(result.status).toBe('confirmed');
          // The selected staff must be one of the qualified staff, NOT the unqualified preferred
          expect(staffIds).toContain(createdStaffId);
          expect(createdStaffId).not.toBe(unmappedPreferredId);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('when preferred staff is qualified but busy, another staff is selected', async () => {
    await fc.assert(
      fc.asyncProperty(
        safeBookingParamsArb,
        staffIdsArb,
        async (params, staffIds) => {
          // The preferred staff is the first one
          const preferredStaffId = staffIds[0];

          const startAt = `2024-03-15T${String(params.startHour).padStart(2, '0')}:${String(params.startMinute).padStart(2, '0')}:00.000Z`;
          const startDate = new Date(startAt);
          const endAtDate = new Date(startDate.getTime() + (params.durationMin + params.bufferMin) * 60 * 1000);

          const serviceStaff = staffIds.map((id) => ({
            serviceId: params.serviceId,
            staffMemberId: id,
          }));

          let createdStaffId: string | null = null;

          const mockPrisma = {
            service: {
              findUnique: jest.fn().mockResolvedValue({
                id: params.serviceId,
                salonId: params.salonId,
                name: 'Test Service',
                durationMin: params.durationMin,
                bufferMin: params.bufferMin,
                priceRial: BigInt(500000),
                requiresDeposit: false,
                depositRial: null,
                serviceStaff,
                serviceEquipment: [],
              }),
            },
            holiday: {
              findFirst: jest.fn().mockResolvedValue(null),
            },
            staffMember: {
              findMany: jest.fn().mockResolvedValue(
                staffIds.map((id) => ({
                  id,
                  salonId: params.salonId,
                  fullName: `Staff-${id.slice(0, 4)}`,
                  role: 'Stylist',
                  active: true,
                })),
              ),
            },
            workingHours: {
              findMany: jest.fn()
                .mockResolvedValueOnce(
                  staffIds.map((id, i) => ({
                    id: `wh-staff-${i}`,
                    ownerKind: 'staff',
                    ownerId: id,
                    weekday: 5,
                    startTime: timeDate(8, 0),
                    endTime: timeDate(18, 0),
                  })),
                )
                .mockResolvedValueOnce([
                  {
                    id: 'wh-chair-1',
                    ownerKind: 'chair',
                    ownerId: params.chairId,
                    weekday: 5,
                    startTime: timeDate(8, 0),
                    endTime: timeDate(18, 0),
                  },
                ]),
            },
            dayOff: {
              findMany: jest.fn().mockResolvedValue([]),
            },
            chair: {
              findMany: jest.fn().mockResolvedValue([
                {
                  id: params.chairId,
                  salonId: params.salonId,
                  name: 'Chair A',
                  active: true,
                  chairEquipment: [],
                },
              ]),
            },
            chairUnavailable: {
              findMany: jest.fn().mockResolvedValue([]),
            },
            appointment: {
              // Preferred staff has an overlapping appointment (they are busy)
              findMany: jest.fn().mockResolvedValue([
                {
                  id: 'appt-blocking',
                  salonId: params.salonId,
                  staffMemberId: preferredStaffId,
                  chairId: 'other-chair',
                  startAt: startDate,
                  endAt: endAtDate,
                  status: 'confirmed',
                },
              ]),
              create: jest.fn().mockImplementation((args: any) => {
                createdStaffId = args.data.staffMemberId;
                return Promise.resolve({
                  id: 'appt-new',
                  ...args.data,
                  createdAt: new Date(),
                });
              }),
            },
          } as any;

          const engine = new SchedulingEngine(mockPrisma);
          const result = await engine.book({
            salonId: params.salonId,
            serviceId: params.serviceId,
            startAt,
            customerId: params.customerId,
            preferredStaffId,
            source: 'web',
          });

          // Property: when preferred is busy, another qualified staff is selected
          expect(result.status).toBe('confirmed');
          expect(createdStaffId).not.toBe(preferredStaffId);
          expect(staffIds).toContain(createdStaffId);
        },
      ),
      { numRuns: 100 },
    );
  });
});
