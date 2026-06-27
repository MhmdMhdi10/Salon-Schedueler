/**
 * Opt-in end-to-end happy-path test (Requirement 6.2, 6.3, 6.4, 6.5).
 *
 * Boots the REAL application in-process via `createApp(...)` from the composition
 * root and drives it with supertest (no real network). Against a configured
 * PostgreSQL database it exercises the booking happy path over HTTP:
 *
 *   1. resolve QR        GET  /api/salons/by-qr/:payload
 *   2. list availability GET  /api/salons/:id/availability?serviceId=&date=
 *   3. authenticate      (mint a customer access token signed with the test secret)
 *   4. create booking    POST /api/appointments  -> 200 { status: 'pending' } (no notification yet)
 *   5. admin approval    POST /api/appointments/:id/approve -> 200 { status: 'confirmed' }
 *   6. confirmation      a notification_log row is written for the appointment
 *
 * Gating: runs only when DATABASE_URL is set; otherwise the whole suite is
 * reported as skipped (not errored) so the default offline suite stays green
 * (R6.4). The app (and its PrismaClient) is created lazily inside beforeAll, so an
 * unset DATABASE_URL can never throw at module load.
 *
 * The existing fetch-mock adapter tests remain as adapter-level checks; this is
 * the full-stack contract verification (R6.5).
 */

import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import { encodeSalonQr } from '@salon/shared';
import { createApp, type CreatedApp } from '../../composition-root.js';

// Run the DB-dependent suite only when a database is configured; otherwise skip.
const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

// Signed into the customer access token and passed into createApp so the auth
// middleware verifies tokens we mint here (matches `jwt.sign({ sub, type:'access' })`).
const JWT_ACCESS_SECRET = 'e2e-access-secret';

/** Build a time-only Date (as Prisma stores @db.Time at epoch, UTC hours). */
function timeDate(hours: number, minutes: number): Date {
  const d = new Date('1970-01-01T00:00:00.000Z');
  d.setUTCHours(hours, minutes, 0, 0);
  return d;
}

// A date whose UTC weekday is used to seed working hours so availability is
// non-empty for it. The engine derives the weekday from the date via getUTCDay().
const DATE = '2025-06-03';
const WEEKDAY = new Date(`${DATE}T00:00:00Z`).getUTCDay();

// Per-run unique suffix so re-runs never collide on unique constraints.
const RUN = Date.now().toString(36);

describeIfDb('E2E happy path (real app + PostgreSQL) [opt-in: requires DATABASE_URL]', () => {
  // Constructed lazily inside beforeAll so module load never boots the app /
  // instantiates Prisma when DATABASE_URL is unset.
  let created: CreatedApp;

  // Seeded entities.
  let salonId: string;
  let salonQrToken: string;
  let staffId: string;
  let chairId: string;
  let serviceId: string;
  let customerId: string;

  beforeAll(async () => {
    created = createApp({ jwtAccessSecret: JWT_ACCESS_SECRET });
    const { prisma } = created;

    const salon = await prisma.salon.create({
      data: { name: 'E2E Salon', qrToken: `e2e-${RUN}`, timezone: 'Asia/Tehran' },
    });
    salonId = salon.id;
    salonQrToken = salon.qrToken;

    const staff = await prisma.staffMember.create({
      data: { salonId, fullName: 'E2E Stylist', role: 'Stylist', active: true },
    });
    staffId = staff.id;

    const chair = await prisma.chair.create({
      data: { salonId, name: 'E2E Chair', active: true },
    });
    chairId = chair.id;

    // Deposit-free service (books to 'pending', awaiting admin approval), no required equipment.
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

    await prisma.serviceStaff.create({ data: { serviceId, staffMemberId: staffId } });

    // Staff + chair working hours so availability is non-empty for DATE.
    await prisma.workingHours.createMany({
      data: [
        {
          ownerKind: 'staff',
          ownerId: staffId,
          weekday: WEEKDAY,
          startTime: timeDate(9, 0),
          endTime: timeDate(18, 0),
        },
        {
          ownerKind: 'chair',
          ownerId: chairId,
          weekday: WEEKDAY,
          startTime: timeDate(9, 0),
          endTime: timeDate(18, 0),
        },
      ],
    });

    // The booking customerId is taken from the authenticated principal's `sub`,
    // so the customer row must exist with that id.
    const customer = await prisma.customer.create({
      data: { phone: `e2e-${RUN}`, fullName: 'E2E Customer', noShowCount: 0 },
    });
    customerId = customer.id;
  }, 30000);

  afterAll(async () => {
    const { prisma } = created;
    // Clean up ALL created rows in reverse FK order, then disconnect.
    const appts = await prisma.appointment.findMany({
      where: { salonId },
      select: { id: true },
    });
    const apptIds = appts.map((a) => a.id);
    if (apptIds.length > 0) {
      await prisma.notificationLog.deleteMany({ where: { appointmentId: { in: apptIds } } });
      await prisma.payment.deleteMany({ where: { appointmentId: { in: apptIds } } });
    }
    await prisma.appointment.deleteMany({ where: { salonId } });
    await prisma.serviceStaff.deleteMany({ where: { serviceId } });
    await prisma.workingHours.deleteMany({ where: { ownerId: { in: [staffId, chairId] } } });
    await prisma.service.deleteMany({ where: { salonId } });
    await prisma.chair.deleteMany({ where: { salonId } });
    await prisma.staffMember.deleteMany({ where: { salonId } });
    await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.salon.deleteMany({ where: { id: salonId } });
    await prisma.$disconnect();
  }, 30000);

  it('resolves QR, lists availability, books (pending), then confirms on admin approval (R6.2, R6.3)', async () => {
    const { app, prisma } = created;

    // 1. Resolve the salon by its encoded QR payload. The payload is a full deep
    //    link (with slashes); URL-encode it so it fits the single path segment.
    const qrPayload = encodeSalonQr(salonQrToken);
    const qrRes = await request(app).get(`/api/salons/by-qr/${encodeURIComponent(qrPayload)}`);
    expect(qrRes.status).toBe(200);
    expect(qrRes.body.salon.id).toBe(salonId);

    // 2. List availability for the service on the chosen date — must be non-empty.
    const availRes = await request(app)
      .get(`/api/salons/${salonId}/availability`)
      .query({ serviceId, date: DATE });
    expect(availRes.status).toBe(200);
    expect(Array.isArray(availRes.body.slots)).toBe(true);
    expect(availRes.body.slots.length).toBeGreaterThan(0);
    const firstSlot = availRes.body.slots[0];
    expect(typeof firstSlot.startAt).toBe('string');

    // 3. Authenticate the customer: mint an access token signed with the same
    //    secret passed into createApp (sub = the seeded customer id).
    const accessToken = jwt.sign({ sub: customerId, type: 'access' }, JWT_ACCESS_SECRET, {
      expiresIn: 300,
    });

    // 4. Create the appointment for the first available slot — it is created as
    //    'pending' (awaiting admin approval) and the customer is NOT notified yet.
    const bookRes = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ salonId, serviceId, startAt: firstSlot.startAt });

    expect(bookRes.status).toBe(200);
    expect(bookRes.body.status).toBe('pending');
    expect(typeof bookRes.body.appointment.id).toBe('string');
    const appointmentId: string = bookRes.body.appointment.id;

    // The new appointment is persisted as 'pending' for the customer.
    const persisted = await prisma.appointment.findUnique({ where: { id: appointmentId } });
    expect(persisted).not.toBeNull();
    expect(persisted?.status).toBe('pending');
    expect(persisted?.customerId).toBe(customerId);

    // No confirmation is dispatched on creation — the customer is notified only
    // after an admin approves, so no notification_log row exists yet.
    const preApprovalLogs = await prisma.notificationLog.findMany({ where: { appointmentId } });
    expect(preApprovalLogs).toHaveLength(0);

    // 5. A salon admin approves the pending booking. RBAC reads the role claim
    //    from the access token, so mint an Admin token (manage_appointments).
    const adminToken = jwt.sign(
      { sub: `e2e-admin-${RUN}`, type: 'access', role: 'Admin' },
      JWT_ACCESS_SECRET,
      { expiresIn: 300 },
    );
    const approveRes = await request(app)
      .post(`/api/appointments/${appointmentId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send();

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.status).toBe('confirmed');

    // The appointment is now persisted as 'confirmed'.
    const confirmedAppt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
    expect(confirmedAppt?.status).toBe('confirmed');

    // 6. Approval dispatched the confirmation: the notification repository logs
    //    the confirmation SMS, so a notification_log row now exists (R6.3).
    const logs = await prisma.notificationLog.findMany({ where: { appointmentId } });
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.some((l) => l.channel === 'sms')).toBe(true);
  }, 30000);
});
