import { When } from '@cucumber/cucumber';
import express, { type Express, type RequestHandler } from 'express';
import request, { type Response } from 'supertest';
import * as jwt from 'jsonwebtoken';
import type { Services } from '../../src/http/app.js';
import type { RequireRole } from '../../src/common/http/require-role.js';
import { adminRouter } from '../../src/admin/controllers/admin.controller.js';
import { appointmentRouter } from '../../src/appointment/controllers/appointment.controller.js';
import { authContextRouter, authRouter } from '../../src/auth/controllers/auth.controller.js';
import { botRouter } from '../../src/bot/controllers/bot.controller.js';
import { cardOrderRouter } from '../../src/card-order/controllers/card-order.controller.js';
import { customerRouter } from '../../src/customer/controllers/customer.controller.js';
import { deviceRouter } from '../../src/device/controllers/device.controller.js';
import {
  InboxController,
  inboxRouter,
  makeWsInboxHandle,
  verifyWsToken,
} from '../../src/inbox/controllers/inbox.controller.js';
import { paymentCallbackRouter, paymentInitiateRouter } from '../../src/payment/controllers/payment.controller.js';
import {
  referralPublicRouter,
  referralRouter,
} from '../../src/referral/controllers/referral.controller.js';
import { ReferralStateError } from '../../src/referral/services/index.js';
import { registrationRouter } from '../../src/registration/controllers/registration.controller.js';
import { salonRouter } from '../../src/salon/controllers/salon.controller.js';
import { subscriptionCallbackRouter, subscriptionRouter } from '../../src/subscription/controllers/subscription.controller.js';
import { waitlistRouter } from '../../src/waitlist/controllers/waitlist.controller.js';
import { platformAdminRouter } from '../../src/platform-admin/controllers/platform-admin.controller.js';
import { BackendWorld } from '../bootstrap/custom.world.js';

const SECRET = 'controller-branch-secret';
const CUSTOMER = { id: 'customer-1' };
const OWNER = {
  id: 'owner-customer-1',
  role: 'Owner' as const,
  staffMemberId: 'staff-owner-1',
  salonId: 'salon-1',
};
const PLATFORM = {
  id: 'platform-1',
  role: 'PlatformAdmin' as const,
  platformAdminId: 'platform-1',
};

const allowRole: RequireRole = () => ((_req, _res, next) => next());

function appFor(
  router: Express | RequestHandler,
  principal?: object,
  parseJson = true,
): Express {
  const app = express();
  if (parseJson) app.use(express.json());
  app.use((req, _res, next) => {
    if (principal) req.principal = principal as any;
    next();
  });
  app.use(router as RequestHandler);
  app.use((error: unknown, _req: unknown, res: express.Response, _next: unknown) => {
    res.status(500).json({ code: 'INTERNAL', error: String(error) });
  });
  return app;
}

async function hit(
  app: Express,
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<Response> {
  const req = (request(app) as any)[method.toLowerCase()](path);
  for (const [name, value] of Object.entries(headers ?? {})) req.set(name, value);
  if (body !== undefined) req.send(body);
  return req;
}

async function withMutedExpectedLog<T>(
  method: 'warn' | 'error',
  operation: () => Promise<T>,
): Promise<T> {
  const previousQuietMode = process.env.E2E_QUIET_LOGS;
  const consoleWithMethod = console as Console & Record<'warn' | 'error', (...args: unknown[]) => void>;
  const previousLogger = consoleWithMethod[method];
  process.env.E2E_QUIET_LOGS = 'false';
  consoleWithMethod[method] = () => undefined;
  try {
    return await operation();
  } finally {
    consoleWithMethod[method] = previousLogger;
    if (previousQuietMode === undefined) delete process.env.E2E_QUIET_LOGS;
    else process.env.E2E_QUIET_LOGS = previousQuietMode;
  }
}

function validRegistrationBody(overrides: Record<string, unknown> = {}) {
  return {
    salonName: 'Branch Matrix Salon',
    ownerName: 'Branch Owner',
    phone: '09121110000',
    businessType: 'hair',
    workMode: 'fixed_salon',
    chairCount: 1,
    services: [{ name: 'Branch service', durationMinutes: 30, priceRial: 100000 }],
    ...overrides,
  };
}

async function exerciseSmallControllerBranches(): Promise<void> {
  await exerciseAuthBranches();
  await exerciseAppointmentBranches();
  await exerciseAdminBranches();
  await exerciseBotBranches();
  await exerciseCardOrderBranches();
  await exerciseCustomerBranches();
  await exerciseDeviceBranches();
  await exercisePaymentBranches();
  await exerciseReferralBranches();
  await exerciseRegistrationBranches();
  await exerciseSalonBranches();
  await exerciseSubscriptionBranches();
  await exerciseWaitlistBranches();
  await exerciseInboxBranches();
  await exercisePlatformAdminBranches();
}

async function exerciseAppointmentBranches(): Promise<void> {
  let appointment: any = {
    id: 'appointment-1',
    salonId: 'salon-1',
    customerId: CUSTOMER.id,
    staffMemberId: 'staff-1',
    status: 'pending',
  };
  let bookingResult: any = { status: 'pending', appointment };
  let walkInResult: any = { status: 'pending', appointment };
  let rescheduleResult: any = {
    previousAppointment: appointment,
    booking: { status: 'pending', appointment },
  };
  let depositMode: 'redirect' | 'card' | 'card-no-bank' | 'cash' = 'redirect';
  let approvalStaffId: string | undefined = 'staff-1';
  let allowed = true;
  let canApproveOwn = true;
  const services: any = {
    calendarService: { getAppointmentById: async () => appointment },
    authorizer: { can: () => allowed },
    resourceRegistration: {
      getStaffMember: async () => ({ canApproveOwnAppointments: canApproveOwn }),
    },
    bookingAbuseGuard: { check: async () => undefined },
    bookingFlow: {
      book: async () => bookingResult,
      approve: async () => appointment,
      reject: async () => appointment,
    },
    paymentService: {
      initiateDeposit: async () => {
        if (depositMode === 'cash') return { method: 'cash', amountRial: 1000 };
        if (depositMode === 'card' || depositMode === 'card-no-bank') {
          return {
            method: 'card_transfer',
            amountRial: 1000,
            cardNumber: '6037991234567890',
            cardHolder: 'Branch Owner',
            ...(depositMode === 'card' ? { bankName: 'Branch Bank' } : {}),
          };
        }
        return { redirectUrl: '/pay/appointment' };
      },
      getDepositOverview: async () => ({ method: 'card_transfer', amountRial: 1000 }),
      uploadManualReceipt: async () => ({ id: 'receipt-1', status: 'pending' }),
      getManualReceiptFile: async () => ({
        id: 'receipt-1',
        fileName: 'receipt.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 3,
        uploadedAt: new Date('2030-01-01T09:00:00Z'),
        status: 'pending',
        data: Buffer.from('img'),
      }),
      reviewManualReceipt: async (_id: string, decision: string) => ({
        status: decision,
        appointmentStatus: decision === 'approved' ? 'confirmed' : 'held',
      }),
    },
    cancellationFlow: { cancel: async () => appointment },
    cancellationService: { markNoShow: async () => appointment },
    appointmentManagementService: {
      createWalkIn: async () => walkInResult,
      reschedule: async () => rescheduleResult,
      requestRescheduleForStaff: async () => ({
        appointment,
        pendingReschedule: { startAt: bookingBody.startAt },
      }),
      acceptReschedule: async () => ({ appointment, decision: 'accepted' }),
      rejectReschedule: async () => ({ appointment, decision: 'rejected' }),
    },
    serviceCatalog: { listServices: async () => [{ id: appointment?.serviceId ?? 'service-1', approvalStaffId }] },
    notificationService: {
      sendConfirmation: async () => undefined,
      sendSalonBookingNotice: async () => undefined,
    },
    schedulingEngine: { reschedule: async () => appointment },
  };
  const bookingApp = appFor(appointmentRouter(services as Services, allowRole), CUSTOMER);
  const bookingBody = {
    salonId: 'salon-1',
    serviceId: 'service-1',
    startAt: '2030-01-01T09:00:00.000Z',
  };
  await hit(bookingApp, 'POST', '/appointments', {});
  await hit(bookingApp, 'POST', '/appointments', { ...bookingBody, locationType: 'invalid' });
  await hit(bookingApp, 'POST', '/appointments', { ...bookingBody, locationType: 'customer' });
  await hit(bookingApp, 'POST', '/appointments', {
    ...bookingBody,
    preferredStaffId: 'staff-1',
    locationType: 'customer',
    locationAddress: 'Customer address',
    customerNote: 'Please use gentle products',
    durationMinutes: 30,
  });
  await hit(bookingApp, 'POST', '/appointments', {
    ...bookingBody,
    locationType: 'customer',
    locationAddress: 'x'.repeat(301),
  });
  await hit(bookingApp, 'POST', '/appointments', {
    ...bookingBody,
    customerNote: 'x'.repeat(1001),
  });
  await hit(bookingApp, 'POST', '/appointments', { ...bookingBody, durationMinutes: 4 });
  await hit(bookingApp, 'POST', '/appointments', { ...bookingBody, durationMinutes: 500 });
  await hit(bookingApp, 'POST', '/appointments', { ...bookingBody, locationType: 'salon' }, {
    'Idempotency-Key': 'branch-key',
  });
  bookingResult = { status: 'rejected', reason: 'no_availability', appointment };
  await hit(bookingApp, 'POST', '/appointments', bookingBody);
  bookingResult = { status: 'rejected', reason: 'resource_busy', appointment };
  await hit(bookingApp, 'POST', '/appointments', bookingBody);
  bookingResult = { status: 'held', appointment };
  depositMode = 'card';
  await hit(bookingApp, 'POST', '/appointments', bookingBody);
  depositMode = 'card-no-bank';
  await hit(bookingApp, 'POST', '/appointments', bookingBody);
  depositMode = 'cash';
  await hit(bookingApp, 'POST', '/appointments', bookingBody);
  depositMode = 'redirect';
  bookingResult = { status: 'confirmed', appointment };
  await hit(bookingApp, 'POST', '/appointments', bookingBody);
  const noAbuseApp = appFor(
    appointmentRouter({ ...services, bookingAbuseGuard: undefined } as Services, allowRole),
    CUSTOMER,
  );
  bookingResult = { status: 'pending', appointment };
  await hit(noAbuseApp, 'POST', '/appointments', bookingBody);

  const noIpApp = express();
  noIpApp.use(express.json());
  noIpApp.use((req, _res, next) => {
    req.principal = CUSTOMER as any;
    Object.defineProperty(req, 'ip', { configurable: true, value: undefined });
    next();
  });
  noIpApp.use(appointmentRouter(services as Services, allowRole));
  await hit(noIpApp, 'POST', '/appointments', bookingBody);

  const noWalkInApp = appFor(
    appointmentRouter({ ...services, appointmentManagementService: undefined } as Services, allowRole),
    OWNER,
  );
  await hit(noWalkInApp, 'POST', '/salons/salon-1/appointments/manual', {});
  const adminApp = appFor(appointmentRouter(services as Services, allowRole), OWNER);
  await hit(adminApp, 'POST', '/salons/salon-1/appointments/manual', {});
  await hit(adminApp, 'POST', '/salons/salon-1/appointments/manual', {
    serviceId: 'service-1', startAt: bookingBody.startAt, phone: '123',
  });
  await hit(adminApp, 'POST', '/salons/salon-1/appointments/manual', {
    serviceId: 'service-1', startAt: bookingBody.startAt, phone: 123,
  });
  await hit(adminApp, 'POST', '/salons/salon-1/appointments/manual', {
    serviceId: 'service-1', startAt: bookingBody.startAt, phone: '09121110010', locationType: 'bad',
  });
  await hit(adminApp, 'POST', '/salons/salon-1/appointments/manual', {
    serviceId: 'service-1', startAt: bookingBody.startAt, phone: '09121110010', customerNote: 'x'.repeat(1001),
  });
  await hit(adminApp, 'POST', '/salons/salon-1/appointments/manual', {
    serviceId: 'service-1', startAt: bookingBody.startAt, phone: '09121110010', durationMinutes: 4,
  });
  await hit(adminApp, 'POST', '/salons/salon-1/appointments/manual', {
    serviceId: 'service-1', startAt: bookingBody.startAt, phone: '09121110010',
    customerNote: 'Counter note', durationMinutes: 30,
  });
  await hit(adminApp, 'POST', '/salons/salon-1/appointments/manual', {
    serviceId: 'service-1', startAt: bookingBody.startAt, phone: '09121110010', durationMinutes: 500,
  });
  await hit(adminApp, 'POST', '/salons/salon-1/appointments/manual', {
    serviceId: 'service-1', startAt: bookingBody.startAt, phone: '09121110010', locationType: 'customer',
  });
  await hit(adminApp, 'POST', '/salons/salon-1/appointments/manual', {
    serviceId: 'service-1', startAt: bookingBody.startAt, phone: '09121110010',
    fullName: 'Walk-in customer', preferredStaffId: 'staff-1', locationType: 'customer',
    locationAddress: 'Customer address',
  });
  walkInResult = { status: 'rejected', reason: 'no_availability', appointment };
  await hit(adminApp, 'POST', '/salons/salon-1/appointments/manual', {
    serviceId: 'service-1', startAt: bookingBody.startAt, phone: '09121110010',
  });
  walkInResult = { status: 'rejected', reason: 'busy', appointment };
  await hit(adminApp, 'POST', '/salons/salon-1/appointments/manual', {
    serviceId: 'service-1', startAt: bookingBody.startAt, phone: '09121110010',
  });
  walkInResult = { status: 'held', appointment };
  await hit(adminApp, 'POST', '/salons/salon-1/appointments/manual', {
    serviceId: 'service-1', startAt: bookingBody.startAt, phone: '09121110010',
  });
  walkInResult = { status: 'confirmed', appointment };
  await hit(adminApp, 'POST', '/salons/salon-1/appointments/manual', {
    serviceId: 'service-1', startAt: bookingBody.startAt, phone: '09121110010',
  });

  const customerAppointmentApp = appFor(appointmentRouter(services as Services, allowRole), CUSTOMER);
  await hit(customerAppointmentApp, 'POST', '/appointments/appointment-1/reschedule', {});
  rescheduleResult = { previousAppointment: appointment, booking: { status: 'held', appointment } };
  await hit(customerAppointmentApp, 'POST', '/appointments/appointment-1/reschedule', {
    startAt: bookingBody.startAt,
    preferredStaffId: 'staff-1',
  });
  rescheduleResult = { previousAppointment: appointment, booking: { status: 'rejected', appointment } };
  await hit(customerAppointmentApp, 'POST', '/appointments/appointment-1/reschedule', { startAt: bookingBody.startAt });

  const noManagementAppointmentApp = appFor(
    appointmentRouter({ ...services, appointmentManagementService: undefined } as Services, allowRole),
    CUSTOMER,
  );
  await hit(noManagementAppointmentApp, 'POST', '/appointments/appointment-1/reschedule', {
    startAt: bookingBody.startAt,
  });
  await hit(noManagementAppointmentApp, 'PATCH', '/appointments/appointment-1/reschedule', {
    startAt: bookingBody.startAt,
  });
  const noManagementCustomerApp = appFor(
    appointmentRouter({ ...services, appointmentManagementService: undefined } as Services, allowRole),
    CUSTOMER,
  );
  await hit(noManagementCustomerApp, 'POST', '/appointments/appointment-1/reschedule/accept');
  await hit(noManagementCustomerApp, 'POST', '/appointments/appointment-1/reschedule/reject');
  const noManagementPatchApp = appFor(
    appointmentRouter({ ...services, appointmentManagementService: undefined } as Services, allowRole),
    OWNER,
  );
  await hit(noManagementPatchApp, 'PATCH', '/appointments/appointment-1/reschedule', {
    startAt: bookingBody.startAt,
    preferredStaffId: 'staff-1',
  });
  rescheduleResult = { previousAppointment: appointment, booking: { status: 'pending', appointment } };
  await hit(customerAppointmentApp, 'POST', '/appointments/appointment-1/reschedule', { startAt: bookingBody.startAt });

  await hit(customerAppointmentApp, 'POST', '/appointments/appointment-1/reschedule/accept');
  await hit(customerAppointmentApp, 'POST', '/appointments/appointment-1/reschedule/reject');
  await hit(customerAppointmentApp, 'GET', '/appointments/appointment-1/deposit');
  await hit(customerAppointmentApp, 'POST', '/appointments/appointment-1/deposit-receipt', {
    fileName: 'receipt.jpg',
    mimeType: 'image/jpeg',
    dataBase64: 'aW1n',
  });
  await hit(customerAppointmentApp, 'POST', '/appointments/appointment-1/deposit-receipt', {});
  await hit(customerAppointmentApp, 'GET', '/appointments/appointment-1/deposit-receipt');
  await hit(appFor(appointmentRouter(services as Services, allowRole), OWNER),
    'POST', '/appointments/appointment-1/deposit-receipt/review', { decision: 'approved' });
  await hit(appFor(appointmentRouter(services as Services, allowRole), OWNER),
    'POST', '/appointments/appointment-1/deposit-receipt/review', {});
  await hit(appFor(appointmentRouter(services as Services, allowRole), { id: 'owner-no-staff', role: 'Owner' }),
    'POST', '/appointments/appointment-1/deposit-receipt/review', { decision: 'rejected', note: 'Reviewed' });

  await hit(appFor(appointmentRouter(services as Services, allowRole), OWNER),
    'POST', '/appointments/appointment-1/reschedule/accept');
  await hit(appFor(appointmentRouter(services as Services, allowRole)),
    'GET', '/appointments/appointment-1/deposit');
  appointment = {
    id: 'appointment-1', salonId: 'salon-1', customerId: PLATFORM.id,
    staffMemberId: 'staff-1', status: 'held',
  };
  await hit(appFor(appointmentRouter(services as Services, allowRole), PLATFORM),
    'GET', '/appointments/appointment-1/deposit');
  appointment = null;
  await hit(appFor(appointmentRouter(services as Services, allowRole), CUSTOMER),
    'POST', '/appointments/appointment-1/reschedule/accept');
  appointment = {
    id: 'appointment-1', salonId: 'salon-1', customerId: 'other-customer',
    staffMemberId: 'staff-1', status: 'pending',
  };
  await hit(appFor(appointmentRouter(services as Services, allowRole), CUSTOMER),
    'POST', '/appointments/appointment-1/reschedule/accept');
  appointment = {
    id: 'appointment-1', salonId: 'salon-1', customerId: CUSTOMER.id,
    staffMemberId: 'staff-1', status: 'pending',
  };

  await hit(appFor(appointmentRouter(services as Services, allowRole)),
    'GET', '/appointments/appointment-1/deposit-receipt');
  appointment = null;
  await hit(appFor(appointmentRouter(services as Services, allowRole), CUSTOMER),
    'GET', '/appointments/appointment-1/deposit-receipt');
  appointment = {
    id: 'appointment-1', salonId: 'salon-1', customerId: 'other-customer',
    staffMemberId: 'staff-1', status: 'pending',
  };
  await hit(appFor(appointmentRouter(services as Services, allowRole), CUSTOMER),
    'GET', '/appointments/appointment-1/deposit-receipt');
  appointment = {
    id: 'appointment-1', salonId: 'salon-1', customerId: CUSTOMER.id,
    staffMemberId: 'staff-1', status: 'pending',
  };
  allowed = false;
  await hit(appFor(appointmentRouter(services as Services, allowRole), OWNER),
    'GET', '/appointments/appointment-1/deposit-receipt');
  allowed = true;

  await hit(adminApp, 'POST', '/appointments/appointment-1/no-show');
  await hit(adminApp, 'POST', '/appointments/appointment-1/approve');
  await hit(adminApp, 'POST', '/appointments/appointment-1/reject');

  const approvalRouter = () => appointmentRouter(services as Services, allowRole);
  await hit(appFor(approvalRouter()), 'POST', '/appointments/appointment-1/approve');
  await hit(appFor(approvalRouter(), CUSTOMER), 'POST', '/appointments/appointment-1/approve');
  appointment = null;
  await hit(appFor(approvalRouter(), OWNER), 'POST', '/appointments/appointment-1/approve');
  appointment = {
    id: 'appointment-1', salonId: 'salon-1', customerId: 'other-customer', staffMemberId: 'staff-1',
    serviceId: 'service-1', status: 'pending',
  };
  canApproveOwn = false;
  await hit(appFor(approvalRouter(), {
    id: 'stylist-customer', role: 'Stylist', staffMemberId: 'staff-1', salonId: 'salon-1',
  }), 'POST', '/appointments/appointment-1/approve');
  approvalStaffId = undefined;
  canApproveOwn = true;
  await hit(appFor(approvalRouter(), {
    id: 'stylist-customer', role: 'Stylist', staffMemberId: 'staff-1', salonId: 'salon-1',
  }), 'POST', '/appointments/appointment-1/approve');
  approvalStaffId = 'staff-1';
  allowed = false;
  await hit(appFor(approvalRouter(), OWNER), 'POST', '/appointments/appointment-1/approve');
  allowed = true;

  appointment = null;
  await hit(appFor(approvalRouter(), OWNER), 'POST', '/appointments/appointment-1/cancel');
  appointment = {
    id: 'appointment-1', salonId: 'salon-1', customerId: 'other-customer', staffMemberId: 'staff-1', status: 'pending',
  };
  await hit(appFor(approvalRouter()), 'POST', '/appointments/appointment-1/cancel');
  await hit(appFor(approvalRouter(), CUSTOMER), 'POST', '/appointments/appointment-1/cancel');
  allowed = false;
  await hit(appFor(approvalRouter(), OWNER), 'POST', '/appointments/appointment-1/cancel');
  allowed = true;
  await hit(appFor(approvalRouter(), OWNER), 'POST', '/appointments/appointment-1/cancel');

  const patchApp = appFor(appointmentRouter(services as Services, allowRole), OWNER);
  await hit(patchApp, 'PATCH', '/appointments/appointment-1/reschedule', {});
  await hit(patchApp, 'PATCH', '/appointments/appointment-1/reschedule', { startAt: 'bad' });
  await hit(patchApp, 'PATCH', '/appointments/appointment-1/reschedule', { startAt: bookingBody.startAt });
  await hit(patchApp, 'PATCH', '/appointments/appointment-1/reschedule', {
    startAt: bookingBody.startAt, preferredStaffId: 'staff-1',
  });
  appointment = null;
  await hit(patchApp, 'PATCH', '/appointments/appointment-1/reschedule', { startAt: bookingBody.startAt });
  appointment = {
    id: 'appointment-1', salonId: 'salon-1', customerId: 'other-customer', staffMemberId: 'staff-1', status: 'pending',
  };
  allowed = false;
  await hit(patchApp, 'PATCH', '/appointments/appointment-1/reschedule', { startAt: bookingBody.startAt });
  allowed = true;

  const previousNodeEnv = process.env.NODE_ENV;
  const previousLimit = process.env.E2E_BOOKING_IP_LIMIT;
  process.env.NODE_ENV = 'test';
  delete process.env.E2E_BOOKING_IP_LIMIT;
  appointmentRouter(services as Services, allowRole);
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousNodeEnv;
  if (previousLimit === undefined) delete process.env.E2E_BOOKING_IP_LIMIT;
  else process.env.E2E_BOOKING_IP_LIMIT = previousLimit;
}

async function exerciseAdminBranches(): Promise<void> {
  const appointment: any = {
    id: 'appointment-1', salonId: 'salon-1', customerId: 'customer-1', staffMemberId: 'staff-1',
    status: 'pending', startAt: new Date('2030-01-01T09:00:00Z'), endAt: new Date('2030-01-01T09:30:00Z'),
    serviceId: 'service-1', customer: { id: 'customer-1', phone: '09121110011', fullName: 'Customer' },
    service: { name: 'Service' }, staffMember: { fullName: 'Stylist' }, locationType: 'salon', locationAddress: null,
    depositReceipt: { status: 'pending' }, payments: [{ status: 'pending' }],
  };
  const ownerStaff: any = {
    id: 'staff-owner-1', salonId: 'salon-1', fullName: 'Owner', role: 'Owner', phone: '09121110012', active: true,
    autoApprove: null, manageOwnAvailability: false, canApproveOwnAppointments: false, assignedChairId: null,
  };
  let stylist: any = {
    id: 'staff-1', salonId: 'salon-1', fullName: 'Stylist', role: 'Stylist', phone: '09121110013', active: true,
    autoApprove: null, manageOwnAvailability: false, canApproveOwnAppointments: false, assignedChairId: null,
  };
  let staff = [ownerStaff, stylist];
  let chairs: any[] = [{ id: 'chair-1', salonId: 'salon-1', name: 'Chair', active: true, kind: 'physical' }];
  let equipmentRows: any[] = [{ id: 'equipment-1', salonId: 'salon-1', name: 'Dryer', deletedAt: null }];
  let service: any = {
    id: 'service-1', name: 'Service', durationMin: 30, bufferMin: 0, priceRial: 1000n,
    requiresDeposit: false, depositRial: null, serviceStaff: [{ staffMemberId: 'staff-1' }],
  };
  let closures: any[] = [];
  let blocks: any[] = [];
  let staffScope: any = { salonId: 'salon-1', manageOwnAvailability: false };
  let notificationSettings: any = {
    getSmsSettings: async () => ({ ownerBooking: false }),
    updateSmsSettings: async (_id: string, patch: any) => ({ ownerBooking: Boolean(patch.ownerBooking) }),
  };
  const salonRegistration: any = {
    getSalonPublicBrand: async () => ({ name: 'Branch Matrix Salon' }),
  };
  let clientService: any = {
    list: async () => [],
    add: async (_salon: string, input: any) => ({ id: 'client-1', ...input }),
  };
  let messageMode = 'success';
  let uniqueMode = 'none';
  let analyticsDashboard = true;
  let allowed = true;
  const hours = [{ weekday: 1, startTime: new Date('1970-01-01T09:00:00Z'), endTime: new Date('1970-01-01T20:00:00Z') }];
  const services: any = {
    calendarService: {
      getSalonCalendar: async () => [appointment],
      getStaffCalendar: async () => [appointment],
      getAppointmentById: async () => appointment,
      getCustomerProfile: async () => ({ id: 'customer-1', fullName: 'Customer' }),
      getPendingAppointments: async () => [appointment],
    },
    waitlistService: { getWaitlist: async () => [{ customerId: 'customer-1', serviceId: 'service-1' }] },
    serviceCatalog: {
      listServices: async () => [service],
      createService: async (input: any) => ({ ...service, ...input, id: 'service-new', priceRial: BigInt(input.priceRial ?? 0), serviceStaff: [] }),
      updateService: async (_id: string, patch: any) => ({ ...service, ...patch, serviceStaff: [] }),
      setServiceStaff: async () => undefined,
      deleteService: async () => undefined,
      addServiceStaff: async () => undefined,
    },
    customerService: {
      getProfile: async () => ({ id: 'customer-1', fullName: 'Customer', phone: '09121110011' }),
      getHistory: async () => [],
      getNotes: async () => [],
      getPreferredStaff: async () => null,
      addNote: async (_customer: string, _author: string | null, body: string) => ({ id: 'note-1', body }),
    },
    authorizer: { can: () => allowed },
    appointmentManagementService: {
      requestRescheduleForStaff: async () => ({ appointment, pendingReschedule: { startAt: '2030-01-01T10:00:00Z' } }),
    },
    paymentService: { initiateDeposit: async () => ({ redirectUrl: '/pay/admin' }) },
    bookingFlow: {
      reject: async () => appointment,
      approve: async () => appointment,
    },
    cancellationFlow: { cancel: async () => appointment },
    notificationService: {
      sendCustomerMessage: async () =>
        messageMode === 'missing' ? null : messageMode === 'failed' ? { ok: false } : { ok: true },
      sendTeamInvitation: async () => ({ ok: true }),
    },
    salonRegistration,
    analyticsService: {
      dashboard: async () => ({ revenue: { totalRial: 1000n, appointmentCount: 1 } }),
      chairUtilization: async () => ({ utilization: 1 }),
      revenue: async () => ({ totalRial: 1000n, appointmentCount: 1 }),
      busiestWindows: async () => ({ busiestWindows: [] }),
    },
    clientService,
    notificationSettings,
    resourceRegistration: {
      listStaff: async () => staff,
      listChairs: async () => chairs,
      getStaffMember: async (id: string) => staff.find((item) => item.id === id) ?? null,
      registerStaffMember: async (_salon: string, fullName: string, role: string, phone: string | null) => {
        if (uniqueMode === 'register') throw { code: 'P2002' };
        if (uniqueMode === 'register-error') throw new Error('staff registration failure');
        const created = { ...stylist, id: `staff-${Date.now()}`, fullName, role, phone };
        staff = [...staff, created];
        return created;
      },
      updateStaffMember: async (id: string, patch: any) => {
        if (uniqueMode === 'chair') throw { code: 'P2002', meta: { target: ['assigned_chair_id'] } };
        if (uniqueMode === 'phone') throw { code: 'P2002', meta: { target: ['phone'] } };
        if (uniqueMode === 'phone-string') throw { code: 'P2002', meta: { target: 'phone' } };
        if (uniqueMode === 'phone-number') throw { code: 'P2002', meta: { target: 42 } };
        if (uniqueMode === 'update-error') throw new Error('staff update failure');
        stylist = { ...stylist, ...patch, id };
        return stylist;
      },
      registerChair: async (_salon: string, name: string) => {
        const chair = { id: `chair-${Date.now()}`, salonId: 'salon-1', name, active: true, kind: 'physical' };
        chairs = [...chairs, chair];
        return chair;
      },
      updateChair: async (id: string, patch: any) => ({ ...chairs.find((item) => item.id === id), ...patch, id }),
      setChairActive: async (id: string, active: boolean) => ({ id, active, kind: 'physical' }),
      listEquipment: async () => equipmentRows,
      registerEquipment: async (_salon: string, name: string) => {
        const equipment = { id: 'equipment-new', salonId: 'salon-1', name, deletedAt: null };
        equipmentRows = [...equipmentRows, equipment];
        return equipment;
      },
      getEquipment: async (id: string) => equipmentRows.find((item) => item.id === id) ?? null,
      updateEquipment: async (id: string, patch: any) => {
        const current = equipmentRows.find((item) => item.id === id) ?? equipmentRows[0];
        return { ...current, ...patch, id };
      },
      deleteEquipment: async () => undefined,
      deleteStaffMember: async () => undefined,
      ensureWorkModeCapacity: async () => undefined,
    },
    availabilityConfig: {
      getWorkingHours: async () => hours,
      setWorkingHours: async () => undefined,
      getBookingWindowDays: async () => 14,
      setBookingWindowDays: async () => undefined,
      getSalonWorkMode: async () => 'fixed_salon',
      setSalonWorkMode: async () => undefined,
      getSalonDepositSettings: async () => ({ depositMethod: 'cash' }),
      setSalonDepositSettings: async (_id: string, settings: any) => settings,
      getApprovalPolicy: async () => ({ autoApprove: false, staff: [] }),
      setSalonAutoApprove: async () => undefined,
      setStaffAutoApprove: async () => undefined,
      setStaffCanApproveOwnAppointments: async () => undefined,
      setSalonBrandAccent: async () => undefined,
      getHolidays: async () => closures,
      addHoliday: async (_salon: string, onDate: string) => {
        const row = { id: `holiday-${Date.now()}-${onDate}`, onDate, startTime: null, endTime: null };
        closures = [...closures, row];
        return row;
      },
      removeHoliday: async () => undefined,
      getStaffAvailabilityContext: async () => staffScope,
      getDaysOff: async () => blocks,
      addDayOff: async (_staffId: string, onDate: string) => {
        const row = { id: `block-${Date.now()}-${onDate}`, onDate, startTime: null, endTime: null };
        blocks = [...blocks, row];
        return row;
      },
      removeDayOffForStaff: async () => true,
      setStaffManageOwnAvailability: async () => undefined,
    },
  };
  const app = appFor(adminRouter(services as Services, allowRole), OWNER);
  await hit(app, 'GET', '/salons/salon-1/calendar');
  await hit(app, 'GET', '/salons/salon-1/calendar?from=bad&to=2030-01-01');
  await hit(app, 'GET', '/salons/salon-1/calendar?from=2030-01-01&to=2030-01-02');
  await hit(app, 'GET', '/salons/salon-1/calendar?from=&to=2030-01-02');
  await hit(app, 'GET', '/salons/salon-1/calendar?from=2030-01-01&to=');
  await hit(app, 'GET', '/salons/salon-1/calendar?from=2030-01-01&to=bad');
  await hit(app, 'GET', '/salons/salon-1/waitlist?from=bad');
  await hit(app, 'GET', '/salons/salon-1/waitlist?from=&to=2030-01-02');
  await hit(app, 'GET', '/salons/salon-1/waitlist?from=2030-01-01&to=bad');
  await hit(app, 'GET', '/salons/salon-1/waitlist?from=2030-01-01&to=2030-01-02');
  await hit(app, 'GET', '/salons/salon-1/customers/customer-1');
  await hit(app, 'POST', '/appointments/appointment-1/reschedule-managed', {});
  await hit(app, 'POST', '/appointments/appointment-1/reschedule-managed', { startAt: '2030-01-01T10:00:00Z' });
  await hit(app, 'GET', '/appointments/appointment-1/customer');
  await hit(app, 'POST', '/appointments/appointment-1/customer-notes', {});
  await hit(app, 'POST', '/appointments/appointment-1/customer-notes', { body: 'note' });
  await hit(app, 'POST', '/appointments/appointment-1/message', {});
  await hit(app, 'POST', '/appointments/appointment-1/message', { message: 'message' });
  for (const mode of ['missing', 'failed', 'success']) {
    messageMode = mode;
    await hit(app, 'POST', '/appointments/appointment-1/message', { message: 'message' });
  }
  await hit(app, 'GET', '/salons/salon-1/pending');
  await hit(app, 'GET', '/salons/salon-1/analytics');
  await hit(app, 'GET', '/salons/salon-1/analytics?from=bad&to=2030-01-02');
  await hit(app, 'GET', '/salons/salon-1/analytics?from=2030-01-01&to=');
  await hit(app, 'GET', '/salons/salon-1/analytics?from=2030-01-01&to=bad');
  await hit(app, 'GET', '/salons/salon-1/staff');
  await hit(app, 'GET', '/staff/staff-1');
  const missingStaffHandlerApp = appFor(
    adminRouter({
      ...services,
      resourceRegistration: {
        ...services.resourceRegistration,
        getStaffMember: (() => {
          let lookup = 0;
          return async () => (++lookup === 1 ? stylist : null);
        })(),
      },
    } as Services, allowRole),
    OWNER,
  );
  await hit(missingStaffHandlerApp, 'GET', '/staff/staff-1');
  await hit(app, 'GET', '/salons/salon-1/clients');
  await hit(app, 'GET', '/salons/salon-1/clients?search=' + 'x'.repeat(81));
  await hit(app, 'POST', '/salons/salon-1/clients', {});
  await hit(app, 'POST', '/salons/salon-1/clients', { fullName: 'Client', phone: 'bad' });
  await hit(app, 'POST', '/salons/salon-1/clients', { fullName: 'Client', phone: '09121110014' });
  await hit(app, 'POST', '/salons/salon-1/clients', { fullName: 'Plus phone', phone: '+989121112233' });
  await hit(app, 'POST', '/salons/salon-1/clients', { fullName: 'Zero phone', phone: '00989121112234' });
  await hit(app, 'POST', '/salons/salon-1/clients', { fullName: 'Country phone', phone: '989121112235' });
  await hit(app, 'POST', '/salons/salon-1/services', { name: 'Null approval', approvalStaffId: null });
  await hit(app, 'POST', '/salons/salon-1/services', { name: 'Empty approval', approvalStaffId: '' });
  await hit(app, 'GET', '/salons/salon-1/sms-settings');
  await hit(app, 'PATCH', '/salons/salon-1/sms-settings', { ownerBooking: 'yes' });
  await hit(app, 'PATCH', '/salons/salon-1/sms-settings', { ownerBooking: true });

  await hit(app, 'POST', '/salons/salon-1/staff', {});
  await hit(app, 'POST', '/salons/salon-1/staff', { fullName: 'X', role: 'Bad' });
  await hit(app, 'POST', '/salons/salon-1/staff', { fullName: 'X', role: 'Stylist', phone: 'bad' });
  await hit(app, 'POST', '/salons/salon-1/staff', { fullName: 'Admin', role: 'Admin' });
  await hit(app, 'POST', '/salons/salon-1/staff', { fullName: 'New', role: 'Stylist', phone: '09121110015' });
  await hit(appFor(adminRouter({
    ...services,
    salonRegistration: { getSalonPublicBrand: undefined },
  } as Services, allowRole), OWNER),
    'POST', '/salons/salon-1/staff', { fullName: 'No brand', role: 'Stylist', phone: '09123334456' });
  const nullBrandInvitationApp = appFor(adminRouter({
    ...services,
    salonRegistration: { getSalonPublicBrand: async () => ({ name: null }) },
  } as Services, allowRole), OWNER);
  await hit(nullBrandInvitationApp, 'POST', '/salons/salon-1/staff', {
    fullName: 'Admin invite', role: 'Admin', phone: '09123334457',
  });
  await hit(nullBrandInvitationApp, 'POST', '/salons/salon-1/staff', {
    fullName: 'Owner invite', role: 'Owner', phone: '09123334458',
  });
  uniqueMode = 'register';
  await hit(app, 'POST', '/salons/salon-1/staff', { fullName: 'Duplicate', role: 'Stylist' });
  uniqueMode = 'none';

  await hit(app, 'PATCH', '/staff/staff-1', { fullName: '' });
  await hit(app, 'PATCH', '/staff/staff-1', { role: 'Bad' });
  await hit(app, 'PATCH', '/staff/staff-1', { phone: 'bad' });
  await hit(app, 'PATCH', '/staff/staff-1', { fullName: 123, phone: 123 });
  await hit(app, 'PATCH', '/staff/staff-1', { phone: 123 });
  await hit(app, 'PATCH', '/staff/staff-1', { phone: '' });
  await hit(app, 'PATCH', '/staff/staff-1', { assignedChairId: 123 });
  await hit(app, 'PATCH', '/staff/staff-1', { active: 'true', assignedChairId: 'bad-chair' });
  await hit(app, 'PATCH', '/staff/staff-1', { active: true, assignedChairId: '' });
  await hit(app, 'PATCH', '/staff/staff-1', { fullName: 'Updated', role: 'Stylist', phone: '09121110016' });
  uniqueMode = 'chair';
  await hit(app, 'PATCH', '/staff/staff-1', { assignedChairId: 'chair-1' });
  uniqueMode = 'phone';
  await hit(app, 'PATCH', '/staff/staff-1', { phone: '09121110017' });
  uniqueMode = 'phone-string';
  await hit(app, 'PATCH', '/staff/staff-1', { phone: '09121110018' });
  uniqueMode = 'phone-number';
  await hit(app, 'PATCH', '/staff/staff-1', { phone: '09121110019' });
  uniqueMode = 'update-error';
  await hit(app, 'PATCH', '/staff/staff-1', { fullName: 'Update error' });
  uniqueMode = 'none';
  const onlyOwnerDeleteApp = appFor(adminRouter({
    ...services,
    resourceRegistration: {
      ...services.resourceRegistration,
      getStaffMember: async () => ownerStaff,
      listStaff: async () => [ownerStaff],
    },
  } as Services, allowRole), OWNER);
  await hit(onlyOwnerDeleteApp, 'DELETE', '/staff/staff-owner-1');
  const lastOwnerDeleteApp = appFor(adminRouter(services as Services, allowRole), OWNER);
  await hit(lastOwnerDeleteApp, 'DELETE', '/staff/staff-owner-1');
  await hit(app, 'DELETE', '/staff/staff-1');
  const missingStaffDeleteApp = appFor(
    adminRouter({
      ...services,
      resourceRegistration: {
        ...services.resourceRegistration,
        getStaffMember: (() => {
          let lookup = 0;
          return async () => (++lookup === 1 ? stylist : null);
        })(),
      },
    } as Services, allowRole),
    OWNER,
  );
  await hit(missingStaffDeleteApp, 'DELETE', '/staff/staff-1');

  await hit(app, 'GET', '/salons/salon-1/chairs');
  await hit(app, 'GET', '/salons/salon-1/working-hours');
  await hit(app, 'PUT', '/salons/salon-1/working-hours', { hours: [{ weekday: 1, startTime: '20:00', endTime: '09:00' }] });
  await hit(app, 'PUT', '/salons/salon-1/working-hours', { hours: [{ weekday: 1, startTime: '09:00', endTime: '20:00' }] });
  await hit(app, 'PUT', '/salons/salon-1/working-hours', {
    hours: [
      { weekday: 1, startTime: '09:00', endTime: '12:00' },
      { weekday: 1, startTime: '11:00', endTime: '13:00' },
    ],
  });
  await hit(app, 'PUT', '/salons/salon-1/working-hours', { hours: [null] });
  await hit(app, 'GET', '/salons/salon-1/deposit-settings');
  await hit(app, 'PATCH', '/salons/salon-1/deposit-settings', {});
  await hit(app, 'PATCH', '/salons/salon-1/deposit-settings', {
    depositMethod: 'card_transfer',
    depositCardNumber: '6037-9912-3456-7890',
    depositCardHolder: 'Test Owner',
    depositBankName: 'Test Bank',
  });
  await hit(app, 'PATCH', '/salons/salon-1/deposit-settings', {
    depositMethod: 'card_transfer', depositCardNumber: '123', depositCardHolder: 'Test Owner',
  });
  await hit(app, 'PATCH', '/salons/salon-1/deposit-settings', {
    depositMethod: 'card_transfer', depositCardNumber: '6037991234567890', depositCardHolder: 'A',
  });
  await hit(app, 'PATCH', '/salons/salon-1/deposit-settings', {
    depositMethod: 'card_transfer', depositCardNumber: '6037991234567890', depositCardHolder: 'Test Owner',
    depositBankName: 'x'.repeat(81),
  });
  await hit(app, 'PATCH', '/salons/salon-1/deposit-settings', {
    depositMethod: 'card_transfer', depositCardNumber: '6037991234567890', depositCardHolder: 'Test Owner',
  });
  await hit(app, 'PATCH', '/salons/salon-1/deposit-settings', {
    depositMethod: 'cash',
  });
  await hit(app, 'PATCH', '/salons/salon-1/deposit-settings', {
    depositMethod: 'card_transfer', depositCardHolder: 'Test Owner',
  });
  await hit(app, 'PATCH', '/salons/salon-1/deposit-settings', {
    depositMethod: 'card_transfer', depositCardNumber: '6037991234567890',
  });
  await hit(app, 'GET', '/salons/salon-1/booking-policy');
  await hit(app, 'PUT', '/salons/salon-1/booking-policy', { workMode: 'bad' });
  await hit(app, 'PUT', '/salons/salon-1/booking-policy', { bookingWindowDays: -1 });
  await hit(app, 'PUT', '/salons/salon-1/booking-policy', {});
  await hit(app, 'PUT', '/salons/salon-1/booking-policy', { bookingWindowDays: 30, workMode: 'hybrid' });
  await hit(app, 'GET', '/salons/salon-1/staff/staff-1/working-hours');
  await hit(app, 'GET', '/salons/salon-1/staff/missing/working-hours');
  await hit(app, 'PUT', '/salons/salon-1/staff/staff-1/working-hours', {});
  await hit(app, 'PUT', '/salons/salon-1/staff/staff-1/working-hours', { hours: [{ weekday: 1, startTime: '09:00', endTime: '20:00' }] });
  await hit(app, 'PUT', '/salons/salon-1/staff/missing/working-hours', { hours: [{ weekday: 1, startTime: '09:00', endTime: '20:00' }] });

  await hit(app, 'POST', '/salons/salon-1/chairs', {});
  await hit(app, 'POST', '/salons/salon-1/chairs', { name: 'New chair' });
  await hit(app, 'PATCH', '/salons/salon-1/chairs/chair-1', {});
  await hit(app, 'PATCH', '/salons/salon-1/chairs/chair-1', { active: true });
  await hit(app, 'PATCH', '/salons/salon-1/chairs/chair-1', { name: 'Renamed chair', active: true });
  await hit(app, 'PATCH', '/salons/salon-1/chairs/chair-1', { active: 'true' });
  await hit(app, 'PATCH', '/salons/salon-1/chairs/chair-1', { name: '' });
  await hit(app, 'PATCH', '/salons/salon-1/chairs/chair-1', { name: 123 });
  await hit(app, 'PATCH', '/salons/salon-1/chairs/chair-1', { name: 'Name only' });
  await hit(app, 'PATCH', '/salons/salon-1/chairs/chair-missing', { active: true });
  await hit(app, 'DELETE', '/salons/salon-1/chairs/chair-missing');
  await hit(app, 'DELETE', '/salons/salon-1/chairs/chair-1');

  await hit(app, 'GET', '/salons/salon-1/equipment');
  await hit(app, 'POST', '/salons/salon-1/equipment', { name: '  ' });
  await hit(app, 'POST', '/salons/salon-1/equipment', { name: 'New equipment' });
  await hit(app, 'POST', '/salons/salon-1/equipment', { name: 123 });
  await hit(app, 'PATCH', '/salons/salon-1/equipment/equipment-missing', { active: true });
  await hit(app, 'PATCH', '/salons/salon-1/equipment/equipment-1', {});
  await hit(app, 'PATCH', '/salons/salon-1/equipment/equipment-1', { name: '' });
  await hit(app, 'PATCH', '/salons/salon-1/equipment/equipment-1', { active: 'true' });
  await hit(app, 'PATCH', '/salons/salon-1/equipment/equipment-1', { name: 'Updated equipment', active: false });
  await hit(app, 'PATCH', '/salons/salon-1/equipment/equipment-1', { name: 'x'.repeat(121) });
  await hit(app, 'PATCH', '/salons/salon-1/equipment/equipment-1', { name: 123 });
  await hit(app, 'PATCH', '/salons/salon-1/equipment/equipment-1', { active: false });
  await hit(app, 'PATCH', '/salons/salon-1/equipment/equipment-1', { name: 'Name only' });
  await hit(app, 'DELETE', '/salons/salon-1/equipment/equipment-missing');
  await hit(app, 'DELETE', '/salons/salon-1/equipment/equipment-1');

  await hit(app, 'POST', '/salons/salon-1/services', {});
  await hit(app, 'POST', '/salons/salon-1/services', { name: 'Deposit', requiresDeposit: true });
  await hit(app, 'POST', '/salons/salon-1/services', { name: 'Deposit', requiresDeposit: true, depositRial: 1000 });
  await hit(app, 'POST', '/salons/salon-1/services', { name: 'Buffered', durationMinutes: 45, bufferMinutes: 15, priceRial: 1000 });
  await hit(app, 'POST', '/salons/salon-1/services', { name: 'Invalid approval', approvalStaffId: 123 });
  await hit(app, 'POST', '/salons/salon-1/services', { name: 'Missing approval', approvalStaffId: 'missing-staff' });
  await hit(app, 'POST', '/salons/salon-1/services', { name: 'Stylist approval', approvalStaffId: 'staff-1' });
  await hit(app, 'POST', '/salons/salon-1/services', { name: 'Owner approval', approvalStaffId: 'staff-owner-1' });
  await hit(app, 'POST', '/salons/salon-1/services', {
    name: 'Bad variable', durationMode: 'variable', minDurationMinutes: 30, maxDurationMinutes: 20,
  });
  await hit(app, 'POST', '/salons/salon-1/services', {
    name: 'Too long variable', durationMode: 'variable', minDurationMinutes: 30, maxDurationMinutes: 481,
  });
  await hit(app, 'POST', '/salons/salon-1/services', {
    name: 'Variable service', durationMode: 'variable', minDurationMinutes: 30, maxDurationMinutes: 60,
  });
  await hit(app, 'POST', '/salons/salon-1/services', {
    name: 'Bad percent', requiresDeposit: true, depositType: 'percentage', depositPercent: 0,
  });
  await hit(app, 'POST', '/salons/salon-1/services', {
    name: 'Percent service', requiresDeposit: true, depositType: 'percentage', depositPercent: 25,
  });
  await hit(app, 'PATCH', '/salons/salon-1/services/service-missing', {});
  await hit(app, 'PATCH', '/salons/salon-1/services/service-1', { name: '' });
  await hit(app, 'PATCH', '/salons/salon-1/services/service-1', { durationMinutes: 1 });
  await hit(app, 'PATCH', '/salons/salon-1/services/service-1', { durationMinutes: 30, requiresDeposit: true, depositRial: 1000 });
  await hit(app, 'PATCH', '/salons/salon-1/services/service-1', { bufferMinutes: 10, priceRial: 2000, requiresDeposit: 'false', depositRial: null });
  await hit(app, 'PATCH', '/salons/salon-1/services/service-1', { depositRial: 0 });
  await hit(app, 'PATCH', '/salons/salon-1/services/service-1', { durationMode: 'bad' });
  await hit(app, 'PATCH', '/salons/salon-1/services/service-1', { minDurationMinutes: 4 });
  await hit(app, 'PATCH', '/salons/salon-1/services/service-1', { maxDurationMinutes: 'bad' });
  await hit(app, 'PATCH', '/salons/salon-1/services/service-1', { depositType: 'bad' });
  await hit(app, 'PATCH', '/salons/salon-1/services/service-1', { depositPercent: 0 });
  await hit(app, 'PATCH', '/salons/salon-1/services/service-1', { depositPercent: null });
  await hit(app, 'PATCH', '/salons/salon-1/services/service-1', { approvalStaffId: 'missing-staff' });
  await hit(app, 'PATCH', '/salons/salon-1/services/service-1', { approvalStaffId: 'staff-owner-1' });
  await hit(app, 'PATCH', '/salons/salon-1/services/service-1', { durationMode: 'fixed' });
  await hit(app, 'PATCH', '/salons/salon-1/services/service-1', { minDurationMinutes: 30, maxDurationMinutes: 31 });
  await hit(app, 'PATCH', '/salons/salon-1/services/service-1', { maxDurationMinutes: 481 });
  await hit(app, 'PATCH', '/salons/salon-1/services/service-1', { depositType: 'fixed' });
  await hit(app, 'PATCH', '/salons/salon-1/services/service-1', { depositPercent: 25 });
  await hit(app, 'PUT', '/salons/salon-1/services/service-1/staff', {});
  await hit(app, 'PUT', '/salons/salon-1/services/service-missing/staff', { staffIds: [] });
  await hit(app, 'PUT', '/salons/salon-1/services/service-1/staff', { staffIds: ['missing-staff'] });
  await hit(app, 'PUT', '/salons/salon-1/services/service-1/staff', { staffIds: ['staff-1', 'staff-1'] });
  await hit(app, 'DELETE', '/salons/salon-1/services/service-missing');
  await hit(app, 'DELETE', '/salons/salon-1/services/service-1');

  await hit(app, 'GET', '/salons/salon-1/approval-policy');
  await hit(app, 'POST', '/salons/salon-1/auto-approve', { autoApprove: 'true' });
  await hit(app, 'POST', '/staff/staff-1/auto-approve', { autoApprove: null });
  await hit(app, 'POST', '/staff/staff-1/auto-approve', { autoApprove: true });
  await hit(app, 'POST', '/staff/staff-1/auto-approve', { autoApprove: 'false' });
  await hit(app, 'POST', '/staff/staff-1/auto-approve', { autoApprove: 'true' });
  await hit(app, 'POST', '/staff/staff-1/approve-own', {});
  await hit(app, 'POST', '/staff/missing/approve-own', { allowed: true });
  stylist = { ...stylist, role: 'Owner' };
  staff = staff.map((item) => item.id === 'staff-1' ? stylist : item);
  await hit(app, 'POST', '/staff/staff-1/approve-own', { allowed: true });
  stylist = { ...stylist, role: 'Stylist' };
  staff = staff.map((item) => item.id === 'staff-1' ? stylist : item);
  await hit(app, 'POST', '/staff/staff-1/approve-own', { allowed: true });
  await hit(app, 'POST', '/salons/salon-1/brand-accent', {});
  await hit(app, 'POST', '/salons/salon-1/brand-accent', { brandAccent: ' teal ' });

  await hit(app, 'GET', '/salons/salon-1/holidays');
  await hit(app, 'POST', '/salons/salon-1/holidays', {});
  await hit(app, 'POST', '/salons/salon-1/holidays', { onDate: 'bad' });
  await hit(app, 'POST', '/salons/salon-1/holidays', { onDate: '2030-01-02', toDate: 'bad' });
  await hit(app, 'POST', '/salons/salon-1/holidays', { onDate: '2030-01-02', toDate: '2030-01-01' });
  await hit(app, 'POST', '/salons/salon-1/holidays', { onDate: '2030-01-02', startTime: '09:00' });
  await hit(app, 'POST', '/salons/salon-1/holidays', { onDate: '2030-01-02', endTime: '10:00' });
  await hit(app, 'POST', '/salons/salon-1/holidays', { onDate: '2030-01-02', startTime: 'bad', endTime: '10:00' });
  await hit(app, 'POST', '/salons/salon-1/holidays', { onDate: '2030-01-02', startTime: '11:00', endTime: '10:00' });
  await hit(app, 'POST', '/salons/salon-1/holidays', { onDate: '2030-01-02', startTime: '09:00', endTime: '10:00' });
  await hit(app, 'POST', '/salons/salon-1/holidays', { onDate: '2030-01-03', toDate: '2030-01-04' });
  await hit(app, 'DELETE', '/salons/salon-1/holidays/holiday-1');
  await hit(app, 'POST', '/salons/salon-1/emergency-close', {});
  await hit(app, 'POST', '/salons/salon-1/emergency-close', { onDate: '2030-01-05' });
  await hit(app, 'POST', '/salons/salon-1/emergency-close', { onDate: '2030-01-06', cancelAppointments: true });

  await hit(app, 'GET', '/staff/staff-1/availability-blocks');
  await hit(app, 'POST', '/staff/staff-1/availability-blocks', {});
  await hit(app, 'POST', '/staff/staff-1/availability-blocks', { onDate: '2030-01-02', toDate: '2030-01-03' });
  await hit(app, 'POST', '/staff/staff-1/availability-blocks', { onDate: '2030-02-01' });
  await hit(app, 'DELETE', '/staff/staff-1/availability-blocks/block-1');
  await hit(app, 'POST', '/staff/staff-1/manage-availability', { allowed: true });

  const noOptionalApp = appFor(
    adminRouter({ ...services, notificationSettings: undefined, clientService: undefined } as Services, allowRole),
    OWNER,
  );
  await hit(noOptionalApp, 'GET', '/salons/salon-1/sms-settings');
  await hit(noOptionalApp, 'PATCH', '/salons/salon-1/sms-settings', {});
  await hit(noOptionalApp, 'GET', '/salons/salon-1/clients');
  await hit(noOptionalApp, 'POST', '/salons/salon-1/clients', {});
  const noManagementApp = appFor(
    adminRouter({ ...services, appointmentManagementService: undefined } as Services, allowRole),
    OWNER,
  );
  await hit(noManagementApp, 'POST', '/appointments/appointment-1/reschedule-managed', {});

  const noBodyAdminApp = appFor(adminRouter(services as Services, allowRole), OWNER, false);
  await hit(noBodyAdminApp, 'POST', '/salons/salon-1/clients');
  await hit(noBodyAdminApp, 'PATCH', '/salons/salon-1/sms-settings');
  await hit(noBodyAdminApp, 'POST', '/salons/salon-1/staff');
  await hit(noBodyAdminApp, 'PATCH', '/staff/staff-1');
  await hit(noBodyAdminApp, 'PATCH', '/salons/salon-1/services/service-1');
  await hit(noBodyAdminApp, 'PUT', '/salons/salon-1/services/service-1/staff');
  await hit(noBodyAdminApp, 'PATCH', '/salons/salon-1/chairs/chair-1');
  await hit(noBodyAdminApp, 'PATCH', '/salons/salon-1/equipment/equipment-1');

  const sparseCalendarRows = [
    { id: 'sparse-1', status: 'pending', customerId: 'customer-1', staffMemberId: 'staff-1', serviceId: 'service-1' },
    { id: 'sparse-2', status: 'pending', staffMemberId: 'staff-1', serviceId: 'service-1', customer: { id: 'customer-2' } },
    { id: 'sparse-3', status: 'pending' },
  ];
  const sparseCalendarApp = appFor(
    adminRouter({
      ...services,
      calendarService: {
        ...services.calendarService,
        getSalonCalendar: async () => sparseCalendarRows,
        getStaffCalendar: async () => sparseCalendarRows,
        getPendingAppointments: async () => sparseCalendarRows,
      },
    } as Services, allowRole),
    OWNER,
  );
  await hit(sparseCalendarApp, 'GET', '/salons/salon-1/calendar?from=2030-01-01&to=2030-01-02');
  await hit(sparseCalendarApp, 'GET', '/salons/salon-1/pending');

  const stylistCalendarApp = appFor(
    adminRouter(services as Services, allowRole),
    { id: 'stylist-customer', role: 'Stylist', staffMemberId: 'staff-1', salonId: 'salon-1' },
  );
  await hit(stylistCalendarApp, 'GET', '/salons/salon-1/calendar?from=2030-01-01&to=2030-01-02');
  await hit(stylistCalendarApp, 'GET', '/salons/salon-1/pending');

  const waitlistSparseApp = appFor(
    adminRouter({
      ...services,
      waitlistService: { getWaitlist: async () => [{ customerId: 'missing', serviceId: 'missing' }] },
      serviceCatalog: { ...services.serviceCatalog, listServices: async () => [] },
      customerService: { ...services.customerService, getProfile: async () => null },
    } as Services, allowRole),
    OWNER,
  );
  await hit(waitlistSparseApp, 'GET', '/salons/salon-1/waitlist?from=2030-01-01&to=2030-01-02');

  const missingProfileApp = appFor(
    adminRouter({
      ...services,
      calendarService: { ...services.calendarService, getCustomerProfile: async () => null },
    } as Services, allowRole),
    OWNER,
  );
  await hit(missingProfileApp, 'GET', '/salons/salon-1/customers/customer-1');
  await hit(stylistCalendarApp, 'GET', '/salons/salon-1/customers/customer-1');
  await hit(
    appFor(adminRouter(services as Services, allowRole), { id: 'owner-no-staff', role: 'Owner', salonId: 'salon-1' }),
    'POST',
    '/appointments/appointment-1/customer-notes',
    { body: 'note' },
  );

  const managedHeldApp = appFor(
    adminRouter({
      ...services,
      appointmentManagementService: {
        requestRescheduleForStaff: async () => ({ appointment, pendingReschedule: { startAt: '2030-01-01T10:00:00Z' } }),
      },
    } as Services, allowRole),
    OWNER,
  );
  await hit(managedHeldApp, 'POST', '/appointments/appointment-1/reschedule-managed', {
    startAt: '2030-01-01T10:00:00Z', preferredStaffId: 'staff-1',
  });
  const managedRejectedApp = appFor(
    adminRouter({
      ...services,
      appointmentManagementService: {
        requestRescheduleForStaff: async () => ({ appointment, pendingReschedule: null }),
      },
    } as Services, allowRole),
    OWNER,
  );
  await hit(managedRejectedApp, 'POST', '/appointments/appointment-1/reschedule-managed', { startAt: '2030-01-01T10:00:00Z' });

  let customerLookup = 0;
  const missingAppointmentCustomerApp = appFor(
    adminRouter({
      ...services,
      calendarService: {
        ...services.calendarService,
        getAppointmentById: async () => (++customerLookup === 1 ? appointment : null),
      },
    } as Services, allowRole),
    OWNER,
  );
  await hit(missingAppointmentCustomerApp, 'GET', '/appointments/appointment-1/customer');
  const missingCustomerApp = appFor(
    adminRouter({
      ...services,
      calendarService: { ...services.calendarService, getAppointmentById: async () => appointment },
      customerService: { ...services.customerService, getProfile: async () => null },
    } as Services, allowRole),
    OWNER,
  );
  await hit(missingCustomerApp, 'GET', '/appointments/appointment-1/customer');
  let noteLookup = 0;
  const missingNoteAppointmentApp = appFor(
    adminRouter({
      ...services,
      calendarService: {
        ...services.calendarService,
        getAppointmentById: async () => (++noteLookup === 1 ? appointment : null),
      },
    } as Services, allowRole),
    OWNER,
  );
  await hit(missingNoteAppointmentApp, 'POST', '/appointments/appointment-1/customer-notes', { body: 'note' });
  const noMessageApp = appFor(
    adminRouter({ ...services, notificationService: {} } as Services, allowRole),
    OWNER,
  );
  await hit(noMessageApp, 'POST', '/appointments/appointment-1/message', { message: 'message' });

  const pendingDeniedStylistApp = appFor(
    adminRouter({
      ...services,
      resourceRegistration: { ...services.resourceRegistration, getStaffMember: async () => ({ ...stylist, canApproveOwnAppointments: false }) },
    } as Services, allowRole),
    { id: 'stylist-customer', role: 'Stylist', staffMemberId: 'staff-1', salonId: 'salon-1' },
  );
  await hit(pendingDeniedStylistApp, 'GET', '/salons/salon-1/pending');

  const noPrincipalAdminApp = appFor(adminRouter(services as Services, allowRole));
  await hit(noPrincipalAdminApp, 'POST', '/appointments/appointment-1/reschedule-managed', { startAt: '2030-01-01T10:00:00Z' });
  await hit(appFor(adminRouter(services as Services, allowRole), CUSTOMER),
    'POST', '/appointments/appointment-1/reschedule-managed', { startAt: '2030-01-01T10:00:00Z' });
  const platformAdminAppointmentApp = appFor(adminRouter(services as Services, allowRole), PLATFORM);
  await hit(platformAdminAppointmentApp, 'POST', '/appointments/appointment-1/reschedule-managed', { startAt: '2030-01-01T10:00:00Z' });
  const noAppointmentAdminApp = appFor(
    adminRouter({ ...services, calendarService: { ...services.calendarService, getAppointmentById: async () => null } } as Services, allowRole),
    OWNER,
  );
  await hit(noAppointmentAdminApp, 'POST', '/appointments/appointment-1/reschedule-managed', { startAt: '2030-01-01T10:00:00Z' });
  const deniedAppointmentAdminApp = appFor(
    adminRouter({ ...services, authorizer: { can: () => false } } as Services, allowRole),
    OWNER,
  );
  await hit(deniedAppointmentAdminApp, 'POST', '/appointments/appointment-1/reschedule-managed', { startAt: '2030-01-01T10:00:00Z' });

  const noPrincipalStaffApp = appFor(adminRouter(services as Services, allowRole));
  await hit(noPrincipalStaffApp, 'POST', '/staff/staff-1/auto-approve', { autoApprove: true });
  const crossSalonStaffApp = appFor(
    adminRouter({
      ...services,
      resourceRegistration: { ...services.resourceRegistration, getStaffMember: async () => ({ ...stylist, salonId: 'salon-2' }) },
    } as Services, allowRole),
    OWNER,
  );
  await hit(crossSalonStaffApp, 'POST', '/staff/staff-1/auto-approve', { autoApprove: true });

  const closureAppointments = [
    { ...appointment, id: 'closure-pending', status: 'pending', startAt: new Date('2030-01-10T09:00:00Z') },
    { ...appointment, id: 'closure-held', status: 'held', startAt: new Date('2030-01-10T10:00:00Z') },
    { ...appointment, id: 'closure-confirmed', status: 'confirmed', startAt: new Date('2030-01-10T11:00:00Z') },
    { ...appointment, id: 'closure-cancelled', status: 'cancelled', startAt: new Date('2030-01-10T12:00:00Z') },
    { ...appointment, id: 'closure-past', status: 'pending', startAt: new Date('2020-01-10T12:00:00Z') },
  ];
  const closureApp = appFor(
    adminRouter({
      ...services,
      calendarService: { ...services.calendarService, getSalonCalendar: async () => closureAppointments },
      cancellationFlow: {
        cancel: async (id: string) => {
          if (id === 'closure-held') throw new Error('cancel failed');
          return appointment;
        },
      },
    } as Services, allowRole),
    OWNER,
  );
  await hit(closureApp, 'POST', '/salons/salon-1/holidays', { onDate: '2030-01-10' });
  await hit(closureApp, 'POST', '/salons/salon-1/emergency-close', { onDate: '2030-01-11', cancelAppointments: true });

  const invalidClosureDtoApp = appFor(
    adminRouter({
      ...services,
      availabilityConfig: { ...services.availabilityConfig, getHolidays: async () => [{ id: 'bad', onDate: '2030-01-01', startTime: 'bad', endTime: null }] },
    } as Services, allowRole),
    OWNER,
  );
  await hit(invalidClosureDtoApp, 'GET', '/salons/salon-1/holidays');

  const invalidHoursApp = appFor(
    adminRouter({
      ...services,
      availabilityConfig: { ...services.availabilityConfig, getWorkingHours: async () => [{ weekday: 1, startTime: 'bad', endTime: 'bad' }] },
    } as Services, allowRole),
    OWNER,
  );
  await hit(invalidHoursApp, 'GET', '/salons/salon-1/working-hours');

  const noSourceRegistrationApp = appFor(
    adminRouter({
      ...services,
      resourceRegistration: {
        ...services.resourceRegistration,
        listStaff: async () => [{ ...ownerStaff, role: 'Admin' }],
        getStaffMember: async () => null,
        registerStaffMember: async () => ({ ...stylist, id: 'edge-no-source', role: 'Stylist' }),
      },
    } as Services, allowRole),
    OWNER,
  );
  await hit(noSourceRegistrationApp, 'POST', '/salons/salon-1/staff', { fullName: 'No source', role: 'Stylist' });

  const emptyHoursRegistrationApp = appFor(
    adminRouter({
      ...services,
      resourceRegistration: {
        ...services.resourceRegistration,
        listStaff: async () => [stylist],
        getStaffMember: async () => null,
        registerStaffMember: async () => ({ ...stylist, id: 'edge-empty-hours', role: 'Stylist' }),
      },
      availabilityConfig: { ...services.availabilityConfig, getWorkingHours: async () => [] },
    } as Services, allowRole),
    OWNER,
  );
  await hit(emptyHoursRegistrationApp, 'POST', '/salons/salon-1/staff', { fullName: 'Empty hours', role: 'Stylist' });

  const mobileRegistrationApp = appFor(
    adminRouter({
      ...services,
      availabilityConfig: { ...services.availabilityConfig, getSalonWorkMode: async () => 'mobile' },
    } as Services, allowRole),
    OWNER,
  );
  await hit(mobileRegistrationApp, 'POST', '/salons/salon-1/staff', { fullName: 'Mobile stylist', role: 'Stylist' });
  const emptyNameMobileRegistrationApp = appFor(
    adminRouter({
      ...services,
      resourceRegistration: {
        ...services.resourceRegistration,
        registerStaffMember: async () => ({ ...stylist, id: 'edge-empty-name', fullName: '', role: 'Stylist' }),
      },
      availabilityConfig: { ...services.availabilityConfig, getSalonWorkMode: async () => 'mobile' },
    } as Services, allowRole),
    OWNER,
  );
  await hit(emptyNameMobileRegistrationApp, 'POST', '/salons/salon-1/staff', { fullName: 'Input name', role: 'Stylist' });
  const emptyNamePhysicalRegistrationApp = appFor(
    adminRouter({
      ...services,
      resourceRegistration: {
        ...services.resourceRegistration,
        registerStaffMember: async () => ({ ...stylist, id: 'edge-empty-physical-name', fullName: '', role: 'Stylist' }),
      },
      availabilityConfig: { ...services.availabilityConfig, getSalonWorkMode: async () => 'fixed_salon' },
    } as Services, allowRole),
    OWNER,
  );
  await hit(emptyNamePhysicalRegistrationApp, 'POST', '/salons/salon-1/staff', { fullName: 'Input name', role: 'Stylist' });
  const rentedRegistrationApp = appFor(
    adminRouter({
      ...services,
      availabilityConfig: { ...services.availabilityConfig, getSalonWorkMode: async () => 'rented_chair' },
    } as Services, allowRole),
    OWNER,
  );
  await hit(rentedRegistrationApp, 'POST', '/salons/salon-1/staff', { fullName: 'Rented stylist', role: 'Stylist' });
  const legacyRegistrationApp = appFor(
    adminRouter({
      ...services,
      availabilityConfig: { ...services.availabilityConfig, getSalonWorkMode: undefined },
    } as Services, allowRole),
    OWNER,
  );
  await hit(legacyRegistrationApp, 'POST', '/salons/salon-1/staff', { fullName: 'Legacy stylist', role: 'Stylist' });
  uniqueMode = 'register-error';
  await hit(app, 'POST', '/salons/salon-1/staff', { fullName: 'Registration error', role: 'Stylist' });
  uniqueMode = 'none';

  const invalidAssignedChairApp = appFor(
    adminRouter({
      ...services,
      resourceRegistration: {
        ...services.resourceRegistration,
        getStaffMember: async () => ({ ...stylist, salonId: undefined }),
      },
    } as Services, allowRole),
    { id: 'owner-no-salon', role: 'Owner' },
  );
  await hit(invalidAssignedChairApp, 'PATCH', '/staff/staff-1', { assignedChairId: 'chair-1' });

  const chairHoursApp = appFor(
    adminRouter({
      ...services,
      resourceRegistration: {
        ...services.resourceRegistration,
        listStaff: async () => [{ ...stylist, mobileChairId: 'chair-1' }],
      },
    } as Services, allowRole),
    OWNER,
  );
  await hit(chairHoursApp, 'PUT', '/salons/salon-1/staff/staff-1/working-hours', { hours: [{ weekday: 1, startTime: '09:00', endTime: '20:00' }] });

  const chairSourceApp = appFor(
    adminRouter({
      ...services,
      resourceRegistration: { ...services.resourceRegistration, listStaff: async () => [{ ...ownerStaff, role: 'Admin' }] },
    } as Services, allowRole),
    OWNER,
  );
  await hit(chairSourceApp, 'GET', '/salons/salon-1/working-hours');
  const noSourceHoursApp = appFor(
    adminRouter({
      ...services,
      resourceRegistration: { ...services.resourceRegistration, listStaff: async () => [], listChairs: async () => [] },
    } as Services, allowRole),
    OWNER,
  );
  await hit(noSourceHoursApp, 'GET', '/salons/salon-1/working-hours');

  const noWorkModePolicyApp = appFor(
    adminRouter({
      ...services,
      availabilityConfig: { ...services.availabilityConfig, getSalonWorkMode: undefined },
    } as Services, allowRole),
    OWNER,
  );
  await hit(noWorkModePolicyApp, 'GET', '/salons/salon-1/booking-policy');

  let approveOwnLookup = 0;
  const missingApproveOwnApp = appFor(
    adminRouter({
      ...services,
      resourceRegistration: {
        ...services.resourceRegistration,
        getStaffMember: async () => (++approveOwnLookup === 1 ? stylist : null),
      },
    } as Services, allowRole),
    OWNER,
  );
  await hit(missingApproveOwnApp, 'POST', '/staff/staff-1/approve-own', { allowed: true });
  const invalidRoleApproveOwnApp = appFor(
    adminRouter({
      ...services,
      resourceRegistration: {
        ...services.resourceRegistration,
        getStaffMember: async () => ({ ...stylist, role: 'Owner' }),
      },
    } as Services, allowRole),
    OWNER,
  );
  await hit(invalidRoleApproveOwnApp, 'POST', '/staff/staff-1/approve-own', { allowed: true });

  const noPrincipalAvailabilityApp = appFor(adminRouter(services as Services, allowRole));
  await hit(noPrincipalAvailabilityApp, 'GET', '/staff/staff-1/availability-blocks');
  await hit(appFor(adminRouter(services as Services, allowRole), CUSTOMER),
    'GET', '/staff/staff-1/availability-blocks');
  const platformAvailabilityApp = appFor(adminRouter(services as Services, allowRole), PLATFORM);
  await hit(platformAvailabilityApp, 'GET', '/staff/staff-1/availability-blocks');
  const missingAvailabilityApp = appFor(
    adminRouter({
      ...services,
      availabilityConfig: { ...services.availabilityConfig, getStaffAvailabilityContext: async () => null },
    } as Services, allowRole),
    OWNER,
  );
  await hit(missingAvailabilityApp, 'GET', '/staff/staff-1/availability-blocks');
  const crossSalonAvailabilityApp = appFor(
    adminRouter({
      ...services,
      availabilityConfig: { ...services.availabilityConfig, getStaffAvailabilityContext: async () => ({ ...staffScope, salonId: 'salon-2' }) },
    } as Services, allowRole),
    OWNER,
  );
  await hit(crossSalonAvailabilityApp, 'GET', '/staff/staff-1/availability-blocks');
  const deniedAvailabilityApp = appFor(
    adminRouter({ ...services, authorizer: { can: () => false } } as Services, allowRole),
    OWNER,
  );
  await hit(deniedAvailabilityApp, 'GET', '/staff/staff-1/availability-blocks');
  const wrongStylistAvailabilityApp = appFor(
    adminRouter({ ...services, authorizer: { can: () => false } } as Services, allowRole),
    { id: 'other-stylist', role: 'Stylist', staffMemberId: 'other-staff', salonId: 'salon-1' },
  );
  await hit(wrongStylistAvailabilityApp, 'GET', '/staff/staff-1/availability-blocks');
  const selfDeniedAvailabilityApp = appFor(
    adminRouter({ ...services, authorizer: { can: () => false } } as Services, allowRole),
    { id: 'stylist-customer', role: 'Stylist', staffMemberId: 'staff-1', salonId: 'salon-1' },
  );
  await hit(selfDeniedAvailabilityApp, 'GET', '/staff/staff-1/availability-blocks');
  const selfAllowedAvailabilityApp = appFor(
    adminRouter({
      ...services,
      authorizer: { can: () => false },
      availabilityConfig: { ...services.availabilityConfig, getStaffAvailabilityContext: async () => ({ ...staffScope, manageOwnAvailability: true }) },
    } as Services, allowRole),
    { id: 'stylist-customer', role: 'Stylist', staffMemberId: 'staff-1', salonId: 'salon-1' },
  );
  await hit(selfAllowedAvailabilityApp, 'GET', '/staff/staff-1/availability-blocks');

  const notFoundBlockApp = appFor(
    adminRouter({
      ...services,
      availabilityConfig: { ...services.availabilityConfig, removeDayOffForStaff: async () => false },
    } as Services, allowRole),
    OWNER,
  );
  await hit(notFoundBlockApp, 'DELETE', '/staff/staff-1/availability-blocks/block-1');

  const noBodyClosureApp = appFor(adminRouter(services as Services, allowRole), OWNER, false);
  await hit(noBodyClosureApp, 'POST', '/salons/salon-1/holidays');
  await hit(noBodyClosureApp, 'POST', '/staff/staff-1/availability-blocks');
  await hit(app, 'POST', '/staff/staff-1/manage-availability', { allowed: 'false' });
  analyticsDashboard = false;
  const legacyAnalytics = { ...services, analyticsService: {
    chairUtilization: async () => ({ utilization: 1 }),
    revenue: async () => ({ totalRial: 1000n, appointmentCount: 1 }),
    busiestWindows: async () => ({ busiestWindows: [] }),
  } };
  await hit(appFor(adminRouter(legacyAnalytics as Services, allowRole), OWNER), 'GET', '/salons/salon-1/analytics?from=2030-01-01&to=2030-01-02');
  analyticsDashboard = true;
}

async function exerciseInboxBranches(): Promise<void> {
  let markReadRow: any = null;
  const removed: any[] = [];
  const hub: any = {
    add: () => undefined,
    remove: (socket: unknown) => removed.push(socket),
  };
  const services: any = {
    wsInboxHub: hub,
    salonInboxService: {
      listForSalon: async () => [],
      countForSalon: async () => 0,
      countUnread: async () => 0,
      markRead: async () => markReadRow,
      markAllRead: async () => 1,
    },
  };
  const validToken = jwt.sign(
    {
      sub: 'staff-1',
      type: 'access',
      role: 'Owner',
      staffMemberId: 'staff-1',
      salonId: 'salon-1',
    },
    SECRET,
  );
  verifyWsToken(validToken, SECRET);
  verifyWsToken(jwt.sign({
    sub: 'platform-1',
    type: 'access',
    role: 'PlatformAdmin',
    platformAdminId: 'platform-1',
  }, SECRET), SECRET);
  verifyWsToken(jwt.sign({}, SECRET), SECRET);
  verifyWsToken(jwt.sign({ type: 'access' }, SECRET), SECRET);
  verifyWsToken('not-a-token', SECRET);
  const wsHandle = makeWsInboxHandle(services as Services, SECRET);
  let destroyed = 0;
  const socket: any = {
    send: () => undefined,
    on: (_event: string, callback: () => void) => { callback(); },
  };
  wsHandle.handleUpgrade(socket, {}, () => { destroyed += 1; });
  wsHandle.handleUpgrade(socket, { subprotocol: 'bearer.invalid' }, () => { destroyed += 1; });
  const noSalon = jwt.sign({ sub: 'staff-1', type: 'access', role: 'Owner' }, SECRET);
  wsHandle.handleUpgrade(socket, { subprotocol: `bearer.${noSalon}` }, () => { destroyed += 1; });
  const noRole = jwt.sign({ sub: 'customer-1', type: 'access', salonId: 'salon-1' }, SECRET);
  wsHandle.handleUpgrade(socket, { subprotocol: `bearer.${noRole}` }, () => { destroyed += 1; });
  wsHandle.handleUpgrade(socket, { subprotocol: `bearer.${validToken}` }, () => { destroyed += 1; });
  const querySocket: any = { send: () => undefined, on: () => undefined };
  wsHandle.handleUpgrade(querySocket, { url: `/?token=${encodeURIComponent(validToken)}` }, () => { destroyed += 1; });
  const throwingSocket: any = { send: () => { throw new Error('closed'); }, on: () => undefined };
  wsHandle.handleUpgrade(throwingSocket, { subprotocol: `bearer.${validToken}` }, () => { destroyed += 1; });
  void destroyed;

  try {
    new InboxController(services as Services).router();
  } catch {
    // Expected constructor contract failure is part of the controller branch.
  }
  const controller = new InboxController(services as Services, allowRole);
  controller.router();
  controller.wsHandle(SECRET);
  const app = appFor(inboxRouter(services as Services, allowRole), OWNER);
  await hit(app, 'GET', '/salons/salon-1/notifications');
  await hit(app, 'GET', '/salons/salon-1/notifications?onlyUnread=1&limit=0&offset=-2');
  await hit(app, 'GET', '/salons/salon-1/notifications?onlyUnread=true&limit=300&offset=1000001');
  await hit(app, 'GET', '/salons/salon-1/notifications?limit=bad&offset=bad');
  await hit(app, 'GET', '/salons/salon-1/notifications/unread-count');
  await hit(app, 'POST', '/salons/salon-1/notifications/read-all');
  await hit(app, 'PATCH', '/notifications/notification-1/read');
  markReadRow = { id: 'notification-1', read: true };
  await hit(app, 'PATCH', '/notifications/notification-1/read');

  const customerApp = appFor(inboxRouter(services as Services, allowRole), CUSTOMER);
  await hit(customerApp, 'GET', '/salons/salon-1/notifications');
  await hit(customerApp, 'GET', '/salons/salon-1/notifications/unread-count');
  await hit(customerApp, 'PATCH', '/notifications/notification-1/read');
  await hit(customerApp, 'POST', '/salons/salon-1/notifications/read-all');
}

async function exercisePlatformAdminBranches(): Promise<void> {
  const validId = '11111111-1111-1111-1111-111111111111';
  const platformAdminService: any = {
    isActiveAdmin: async () => true,
    dashboard: async () => ({ ok: true }),
    listSalons: async () => ({ data: [], meta: {} }),
    getSalon: async () => ({ id: validId }),
    getDetail: async () => ({ resource: 'salons', record: {} }),
    setSalonActive: async () => ({ id: validId, active: true }),
    listCustomers: async () => ({ data: [], meta: {} }),
    listStaff: async () => ({ data: [], meta: {} }),
    setStaffActive: async () => ({ id: validId, active: true }),
    listAppointments: async () => ({ data: [], meta: {} }),
    completeAppointment: async () => ({ id: validId, status: 'completed' }),
    recordAudit: async () => undefined,
    listSubscriptions: async () => ({ data: [], meta: {} }),
    listPayments: async () => ({ data: [], meta: {} }),
    listWaitlist: async () => ({ data: [], meta: {} }),
    listQrScans: async () => ({ data: [], meta: {} }),
    listAuditLogs: async () => ({ data: [], meta: {} }),
  };
  const app = appFor(
    platformAdminRouter({
      bookingFlow: { approve: async () => ({ id: validId }), reject: async () => ({ id: validId }) },
      cancellationFlow: { cancel: async () => ({ id: validId }) },
      cancellationService: { markNoShow: async () => ({ id: validId }) },
    } as unknown as Services, platformAdminService),
    PLATFORM,
  );
  await hit(app, 'GET', '/platform-admin/dashboard');
  await hit(app, 'GET', '/platform-admin/salons');
  await hit(app, 'GET', '/platform-admin/salons?page=bad&limit=bad&search=%20&from=bad&to=2030-01-01');
  await hit(app, 'GET', '/platform-admin/salons/not-an-id');
  await hit(app, 'GET', `/platform-admin/salons/${validId}`);
  await hit(app, 'GET', `/platform-admin/details/nope/${validId}`);
  await hit(app, 'GET', `/platform-admin/details/salons/not-an-id`);
  await hit(app, 'GET', `/platform-admin/details/salons/${validId}`);
  await hit(app, 'PATCH', `/platform-admin/salons/not-an-id/status`, { active: true });
  await hit(app, 'PATCH', `/platform-admin/salons/${validId}/status`, {});
  await hit(app, 'PATCH', `/platform-admin/salons/${validId}/status`, { active: true });
  await hit(app, 'GET', '/platform-admin/customers?status=active&salonId=salon-1&source=web');
  await hit(app, 'GET', '/platform-admin/staff');
  await hit(app, 'PATCH', `/platform-admin/staff/not-an-id/status`, { active: true });
  await hit(app, 'PATCH', `/platform-admin/staff/${validId}/status`, { active: 'true' });
  await hit(app, 'PATCH', `/platform-admin/staff/${validId}/status`, { active: true });
  await hit(app, 'GET', '/platform-admin/appointments');
  await hit(app, 'POST', `/platform-admin/appointments/not-an-id/action`, { action: 'approve' });
  await hit(app, 'POST', `/platform-admin/appointments/${validId}/action`, {});
  for (const action of ['approve', 'reject', 'cancel', 'no_show', 'complete', 'unknown']) {
    await hit(app, 'POST', `/platform-admin/appointments/${validId}/action`, { action });
  }
  await hit(app, 'GET', '/platform-admin/subscriptions');
  await hit(app, 'GET', '/platform-admin/payments');
  await hit(app, 'GET', '/platform-admin/waitlist');
  await hit(app, 'GET', '/platform-admin/qr-scans');
  await hit(app, 'GET', '/platform-admin/audit-logs');
}

async function exerciseAuthBranches(): Promise<void> {
  let otpDetailsCalls = 0;
  let verifyCalls = 0;
  let refreshCalls = 0;
  const authServices = {
    authService: {
      requestOtpWithDetails: async () => ({
        otpLength: 6,
        ...(otpDetailsCalls++ % 2 === 1 ? { devOtp: '123456' } : {}),
      }),
      verifyOtp: async () => ({
        accessToken: 'access',
        refreshToken: 'refresh',
        ...(verifyCalls++ % 2 === 1 ? { staffContexts: [] } : {}),
      }),
      refresh: async () => ({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
        ...(refreshCalls++ % 2 === 1 ? { staffContexts: [] } : {}),
      }),
    },
  } as unknown as Services;
  const app = appFor(authRouter(authServices));
  await hit(app, 'POST', '/auth/otp/request', {});
  await hit(app, 'POST', '/auth/otp/request', { phone: '09121110001' });
  await hit(app, 'POST', '/auth/otp/request', { phone: '09121110002' });
  await hit(app, 'POST', '/auth/otp/verify', {});
  await hit(app, 'POST', '/auth/otp/verify', { phone: '09121110001', code: '123456' });
  await hit(app, 'POST', '/auth/otp/verify', { phone: '09121110001', code: '123456' }, {
    'X-Auth-Client': 'mobile',
    Origin: 'http://localhost:5273',
  });
  await hit(app, 'POST', '/auth/refresh', {});
  await hit(app, 'POST', '/auth/refresh', { refreshToken: 'refresh' }, {
    'X-Auth-Client': 'mobile',
  });
  await hit(app, 'POST', '/auth/refresh', undefined, {
    'X-Auth-Client': 'mobile',
    Origin: 'http://localhost:5273',
    Cookie: 'salon_refresh=refresh',
  });
  await hit(app, 'POST', '/auth/refresh', undefined, {
    'X-Auth-Client': 'web',
    Cookie: 'salon_refresh=refresh',
  });
  await hit(app, 'POST', '/auth/logout', {});

  const contextServices = {
    authService: {
      getStaffContexts: async () => [{ staffMemberId: 'staff-1', salonId: 'salon-1' }],
      selectStaffContext: async () => ({
        accessToken: 'context-access',
        refreshToken: 'context-refresh',
        staffContexts: [],
      }),
    },
  } as unknown as Services;
  const contextPrincipal = { id: 'owner-1', role: 'Owner', staffMemberId: 'staff-1', salonId: 'salon-1' };
  const unauthenticatedContextApp = appFor(authContextRouter(contextServices));
  await hit(unauthenticatedContextApp, 'GET', '/auth/contexts');
  await hit(unauthenticatedContextApp, 'POST', '/auth/context', {});
  const contextApp = appFor(authContextRouter(contextServices), contextPrincipal);
  await hit(contextApp, 'GET', '/auth/contexts');
  await hit(contextApp, 'POST', '/auth/context', {});
  await hit(contextApp, 'POST', '/auth/context', { staffMemberId: 'staff-1' });
  await hit(contextApp, 'POST', '/auth/context', { staffMemberId: 'staff-1' }, {
    'X-Auth-Client': 'mobile',
  });
  const contextWithoutListApp = appFor(authContextRouter({
    authService: {
      getStaffContexts: async () => [],
      selectStaffContext: async () => ({ accessToken: 'context-access', refreshToken: 'context-refresh' }),
    },
  } as unknown as Services), contextPrincipal);
  await hit(contextWithoutListApp, 'POST', '/auth/context', { staffMemberId: 'staff-1' });

  const previousNodeEnv = process.env.NODE_ENV;
  const previousLimit = process.env.E2E_OTP_REQUEST_IP_LIMIT;
  process.env.NODE_ENV = 'test';
  delete process.env.E2E_OTP_REQUEST_IP_LIMIT;
  authRouter(authServices);
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousNodeEnv;
  if (previousLimit === undefined) delete process.env.E2E_OTP_REQUEST_IP_LIMIT;
  else process.env.E2E_OTP_REQUEST_IP_LIMIT = previousLimit;
}

async function exerciseBotBranches(): Promise<void> {
  const app = appFor(
    botRouter(
      {
        botService: {
          handleUpdate: async () => {
            throw new Error('simulated dispatcher failure');
          },
        },
      } as unknown as Services,
      'branch-secret',
    ),
  );
  await hit(app, 'POST', '/bots/telegram/branch-secret', { update_id: 1 });
}

async function exerciseCardOrderBranches(): Promise<void> {
  const app = appFor(cardOrderRouter(allowRole), OWNER);
  await hit(app, 'POST', '/salons/salon-1/card-orders', {});
  await hit(app, 'POST', '/salons/salon-1/card-orders', {
    template: 'salon-qr-card',
    quantity: 1,
    contactName: 'Owner',
    phone: '09121110002',
    address: 'Tehran',
  });
}

async function exerciseCustomerBranches(): Promise<void> {
  let profile: any = null;
  let entry: any = null;
  const app = appFor(
    customerRouter({
      customerService: {
        getProfile: async () => profile,
        updateProfile: async (_id: string, fullName: string) => ({ id: CUSTOMER.id, fullName }),
        getHistory: async () => [],
      },
      waitlistService: {
        getCustomerEntries: async () => [],
        getEntry: async () => entry,
        cancelEntry: async (id: string) => ({ id, status: 'cancelled' }),
      },
    } as unknown as Services),
    CUSTOMER,
  );
  await hit(app, 'GET', '/customers/me/profile');
  profile = { id: CUSTOMER.id, phone: '09121110003', fullName: null };
  await hit(app, 'GET', '/customers/me/profile');
  await hit(app, 'PATCH', '/customers/me/profile', {});
  await hit(appFor(customerRouter({
    customerService: {
      getProfile: async () => profile,
      updateProfile: async (_id: string, fullName: string) => ({ id: CUSTOMER.id, fullName }),
      getHistory: async () => [],
    },
    waitlistService: {
      getCustomerEntries: async () => [],
      getEntry: async () => entry,
      cancelEntry: async (id: string) => ({ id, status: 'cancelled' }),
    },
  } as unknown as Services), CUSTOMER, false), 'PATCH', '/customers/me/profile');
  await hit(app, 'PATCH', '/customers/me/profile', { fullName: '' });
  await hit(app, 'PATCH', '/customers/me/profile', { fullName: 'Branch Customer' });
  await hit(app, 'GET', '/customers/me/appointments');
  await hit(app, 'GET', '/customers/me/waitlist');
  await hit(app, 'DELETE', '/waitlist/entry-1');
  entry = { id: 'entry-1', customerId: 'other-customer' };
  await hit(app, 'DELETE', '/waitlist/entry-1');
  entry = { id: 'entry-1', customerId: CUSTOMER.id };
  await hit(app, 'DELETE', '/waitlist/entry-1');
}

async function exerciseDeviceBranches(): Promise<void> {
  const app = appFor(
    deviceRouter({
      notificationService: { registerDeviceToken: async () => undefined },
    } as unknown as Services),
    CUSTOMER,
  );
  await hit(app, 'POST', '/devices/token', {});
  await hit(app, 'POST', '/devices/token', { token: 'device-token', platform: 'web' });
}

async function exercisePaymentBranches(): Promise<void> {
  let appointment: any = null;
  let paymentMethod: 'redirect' | 'card' | 'card-no-bank' = 'redirect';
  let callbackConfirmed = false;
  const app = appFor(
    paymentInitiateRouter({
      calendarService: { getAppointmentById: async () => appointment },
      paymentService: {
        initiateDeposit: async () => {
          if (paymentMethod === 'card' || paymentMethod === 'card-no-bank') {
            return {
              method: 'card_transfer', amountRial: 1000, cardNumber: '6037991234567890',
              cardHolder: 'Branch Owner', ...(paymentMethod === 'card' ? { bankName: 'Branch Bank' } : {}),
            };
          }
          return { redirectUrl: '/pay/branch' };
        },
      },
    } as unknown as Services),
    CUSTOMER,
  );
  await hit(app, 'POST', '/payments/initiate', {});
  await hit(app, 'POST', '/payments/initiate', { appointmentId: 'missing-appointment' });
  appointment = { id: 'appointment-1', customerId: 'other-customer' };
  await hit(app, 'POST', '/payments/initiate', { appointmentId: appointment.id });
  appointment.customerId = CUSTOMER.id;
  await hit(app, 'POST', '/payments/initiate', { appointmentId: appointment.id });
  paymentMethod = 'card';
  await hit(app, 'POST', '/payments/initiate', { appointmentId: appointment.id });
  paymentMethod = 'card-no-bank';
  await hit(app, 'POST', '/payments/initiate', { appointmentId: appointment.id });
  paymentMethod = 'redirect';
  await hit(appFor(paymentInitiateRouter({
    calendarService: { getAppointmentById: async () => appointment },
    paymentService: { initiateDeposit: async () => ({ redirectUrl: '/pay/platform' }) },
  } as unknown as Services), PLATFORM), 'POST', '/payments/initiate', { appointmentId: appointment.id });

  const callbackApp = appFor(
    paymentCallbackRouter({
      paymentService: {
        handleCallback: async () => ({ confirmed: callbackConfirmed }),
      },
      notificationService: {
        sendConfirmation: async () => undefined,
        sendSalonBookingNotice: async () => undefined,
      },
    } as unknown as Services),
  );
  await hit(callbackApp, 'POST', '/payments/callback', {});
  await hit(appFor(paymentCallbackRouter({
    paymentService: { handleCallback: async () => ({ confirmed: false }) },
    notificationService: { sendConfirmation: async () => undefined, sendSalonBookingNotice: async () => undefined },
  } as unknown as Services), undefined, false), 'POST', '/payments/callback');
  await hit(callbackApp, 'POST', '/payments/callback', { authority: 'branch-a', status: 'NOK' });
  await hit(callbackApp, 'POST', '/payments/callback', { authority: 123, status: 'OK' });
  await hit(callbackApp, 'POST', '/payments/callback', { authority: 'branch-success', success: '1' });
  await hit(callbackApp, 'POST', '/payments/callback', { authority: 'branch-false', success: '0' });
  await hit(callbackApp, 'POST', '/payments/callback', { authority: 'branch-no-status' });
  callbackConfirmed = true;
  await hit(callbackApp, 'POST', '/payments/callback', {
    Authority: 'branch-b',
    Status: 'OK',
    appointmentId: 'appointment-1',
  });
  await hit(callbackApp, 'POST', '/payments/callback', {
    authority: 'branch-c', status: 'OK', appointmentID: 'appointment-1',
  });
  const throwingCallbackApp = appFor(paymentCallbackRouter({
    paymentService: { handleCallback: async () => { throw new Error('callback failure'); } },
    notificationService: { sendConfirmation: async () => undefined, sendSalonBookingNotice: async () => undefined },
  } as unknown as Services));
  await hit(throwingCallbackApp, 'POST', '/payments/callback', { authority: 'branch-error', status: 'OK' });
}

async function exerciseReferralBranches(): Promise<void> {
  const unavailable = {
    referralService: undefined,
  } as unknown as Services;
  const unavailablePublic = appFor(referralPublicRouter(unavailable));
  await hit(unavailablePublic, 'GET', '/referrals/claim/token');
  const unavailableProtected = appFor(referralRouter(unavailable, allowRole), OWNER);
  await hit(unavailableProtected, 'POST', '/referrals', {});
  await hit(unavailableProtected, 'GET', '/customers/me/referrals');
  await hit(unavailableProtected, 'GET', '/salons/salon-1/referrals');
  await hit(unavailableProtected, 'POST', '/referrals/ref-1/redeem');

  let claim: any = null;
  let redeemMode = 'success';
  const referralService: any = {
    getClaimPreview: async () => claim,
    create: async (input: any) => ({ id: 'ref-1', ...input }),
    listForCustomer: async () => [],
    listForSalon: async () => [],
    redeem: async () => {
      if (redeemMode === 'not-found') throw new ReferralStateError('NOT_FOUND');
      if (redeemMode === 'wrong-salon') throw new ReferralStateError('WRONG_SALON');
      if (redeemMode === 'conflict') throw new ReferralStateError('NOT_REWARDABLE');
      if (redeemMode === 'error') throw new Error('redeem failure');
      return { id: 'ref-1', status: 'redeemed' };
    },
  };
  const publicApp = appFor(referralPublicRouter({ referralService } as unknown as Services));
  await hit(publicApp, 'GET', '/referrals/claim/token');
  claim = {
    salonName: 'Salon',
    city: 'Tehran',
    status: 'pending',
    rewardAmountRial: 1000,
    requiredBookings: 2,
  };
  await hit(publicApp, 'GET', '/referrals/claim/token');

  const ownerApp = appFor(referralRouter({ referralService } as unknown as Services, allowRole), OWNER);
  await hit(ownerApp, 'POST', '/referrals', { salonName: 'X', city: 'Tehran' });
  await hit(ownerApp, 'GET', '/customers/me/referrals');
  const customerApp = appFor(referralRouter({ referralService } as unknown as Services, allowRole), CUSTOMER);
  await hit(customerApp, 'POST', '/referrals', {
    salonName: 'Salon',
    city: 'Tehran',
    salonPhone: '09121110004',
    salonInstagram: '@branch',
  });
  await hit(customerApp, 'POST', '/referrals', { salonName: 'Salon', city: 'Tehran' });
  await hit(
    appFor(referralRouter({ referralService } as unknown as Services, allowRole), CUSTOMER, false),
    'POST',
    '/referrals',
  );
  await hit(customerApp, 'GET', '/customers/me/referrals');
  await hit(ownerApp, 'GET', '/salons/salon-1/referrals');
  const noSalonApp = appFor(
    referralRouter({ referralService } as unknown as Services, allowRole),
    { id: 'owner-2', role: 'Owner' },
  );
  await hit(noSalonApp, 'POST', '/referrals/ref-1/redeem');
  await hit(ownerApp, 'POST', '/referrals/ref-1/redeem');
  for (const mode of ['not-found', 'wrong-salon', 'conflict', 'error']) {
    redeemMode = mode;
    await hit(ownerApp, 'POST', '/referrals/ref-1/redeem');
  }
}

async function exerciseRegistrationBranches(): Promise<void> {
  let mode = 'success';
  let taken = false;
  const services: any = {
    salonRegistration: {
      registerSalon: async () => {
        if (mode === 'duplicate') throw { code: 'P2002' };
        if (mode === 'error') throw new Error('registration failure');
        return { salon: { id: 'salon-branch', name: 'Branch Matrix Salon' } };
      },
      isPhoneTaken: async () => taken,
    },
    subscriptionService: { startTrial: async () => undefined },
  };
  const app = appFor(registrationRouter(services as Services));
  await hit(app, 'POST', '/register/salon', { website: 'bot' });
  await hit(app, 'POST', '/register/salon', {});
  await hit(app, 'POST', '/register/salon', validRegistrationBody());
  mode = 'duplicate';
  await hit(app, 'POST', '/register/salon', validRegistrationBody({ phone: '09121110005' }));
  mode = 'error';
  await hit(app, 'POST', '/register/salon', validRegistrationBody({ phone: '09121110006' }));
  mode = 'success';
  const referralServices = {
    ...services,
    referralService: {
      linkSalon: async () => {
        throw new Error('link failed');
      },
    },
  };
  await withMutedExpectedLog('warn', () =>
    hit(
      appFor(registrationRouter(referralServices as Services)),
      'POST',
      '/register/salon',
      validRegistrationBody({ phone: '09121110007', referralToken: 'ref-token' }),
    ),
  );
  await hit(app, 'GET', '/register/check-phone');
  taken = false;
  await hit(app, 'GET', '/register/check-phone?phone=09121110008');
  taken = true;
  await hit(app, 'GET', '/register/check-phone?phone=09121110009');

  const previousNodeEnv = process.env.NODE_ENV;
  const previousLimit = process.env.E2E_REGISTRATION_IP_LIMIT;
  process.env.NODE_ENV = 'test';
  delete process.env.E2E_REGISTRATION_IP_LIMIT;
  registrationRouter(services as Services);
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousNodeEnv;
  if (previousLimit === undefined) delete process.env.E2E_REGISTRATION_IP_LIMIT;
  else process.env.E2E_REGISTRATION_IP_LIMIT = previousLimit;
}

async function exerciseSalonBranches(): Promise<void> {
  let workMode = 'fixed_salon';
  const app = appFor(
    salonRouter(
      {
        salonRegistration: {
          resolveQr: async () => ({
            salon: { id: 'salon-1', name: 'Salon', brandAccent: null },
            staff: { id: 'staff-1', fullName: 'Stylist' },
          }),
          getSalonPublicBrand: async () => ({ name: 'Salon', brandAccent: null }),
        },
        resourceRegistration: {
          listBookableStaff: async () => [{ id: 'staff-1', fullName: 'Stylist', role: 'Stylist' }],
        },
        availabilityConfig: {
          getBookingWindowDays: async () => 14,
          getSalonWorkMode: async () => workMode,
        },
        serviceCatalog: {
          listServices: async () => [
            {
              id: 'service-1',
              name: 'Service',
              durationMin: 30,
              bufferMin: 0,
              priceRial: 1000n,
              requiresDeposit: false,
              depositRial: null,
              serviceStaff: [],
            },
          ],
        },
        schedulingEngine: { getAvailability: async () => [] },
        qrService: { recordScan: async () => undefined },
      } as unknown as Services,
      ((_req, _res, next) => next()) as RequestHandler,
    ),
  );
  await hit(app, 'GET', '/salons/by-qr/bad');
  await hit(app, 'GET', '/salons/:id/brand'.replace(':id', 'salon-1'));
  await hit(app, 'GET', '/salons/salon-1/stylists');
  for (const mode of ['fixed_salon', 'hybrid', 'mobile']) {
    workMode = mode;
    await hit(app, 'GET', '/salons/salon-1/booking-policy');
  }
  await hit(app, 'GET', '/salons/salon-1/services');
  await hit(app, 'GET', '/salons/salon-1/availability');
  await hit(app, 'GET', '/salons/salon-1/availability?serviceId=service-1&date=2030-01-01&locationType=bad');
  await hit(app, 'GET', '/salons/salon-1/availability?serviceId=service-1&date=2030-01-01&staffId=staff-1');
  await hit(app, 'GET', '/salons/salon-1/availability?serviceId=service-1&date=2030-01-01&durationMinutes=45');
  await hit(app, 'POST', '/salons/salon-1/scan');
  await hit(app, 'POST', '/salons/salon-1/scan', { source: 'qr' });
  await hit(app, 'POST', '/salons/salon-1/scan?utm_source=qr');

  const noBodyApp = appFor(
    salonRouter({
      qrService: { recordScan: async () => undefined },
    } as unknown as Services, ((_req, _res, next) => next()) as RequestHandler),
    undefined,
    false,
  );
  await hit(noBodyApp, 'POST', '/salons/salon-1/scan');

  const noWorkModeApp = appFor(
    salonRouter(
      {
        availabilityConfig: {
          getBookingWindowDays: async () => 14,
        },
      } as unknown as Services,
      ((_req, _res, next) => next()) as RequestHandler,
    ),
  );
  await hit(noWorkModeApp, 'GET', '/salons/salon-1/booking-policy');
}

async function exerciseSubscriptionBranches(): Promise<void> {
  let detail: any = null;
  let callbackMode = 'success';
  const subscriptionService: any = {
    getPlans: () => [{ kind: 'monthly', durationDays: 30, priceRial: 1000n }],
    getStatusResponse: async () => detail,
    initiatePurchase: async () => ({ redirectUrl: '/pay/subscription' }),
    findPaymentByAuthority: async () => (callbackMode === 'missing' ? null : { id: 'payment-1' }),
    activateFromPayment: async () => {
      if (callbackMode === 'error') throw new Error('activation failure');
    },
  };
  const app = appFor(
    subscriptionRouter({ subscriptionService } as unknown as Services, allowRole),
    OWNER,
  );
  await hit(app, 'GET', '/subscription/plans');
  await hit(app, 'GET', '/salons/salon-1/subscription');
  detail = { status: 'active', planKind: 'monthly', expiresAt: new Date('2030-01-01') };
  await hit(app, 'GET', '/salons/salon-1/subscription');
  await hit(app, 'POST', '/subscription/purchase', {});
  await hit(app, 'POST', '/subscription/purchase', { salonId: 'salon-1', plan: 'trial' });
  await hit(app, 'POST', '/subscription/purchase', { salonId: 'salon-1', plan: 'monthly' });

  const callbackApp = appFor(subscriptionCallbackRouter({ subscriptionService } as unknown as Services));
  await hit(callbackApp, 'GET', '/subscriptions/callback');
  await hit(callbackApp, 'GET', '/subscriptions/callback?Authority=x&Status=NOK');
  callbackMode = 'missing';
  await withMutedExpectedLog('error', () =>
    hit(callbackApp, 'GET', '/subscriptions/callback?Authority=x&Status=OK'),
  );
  callbackMode = 'error';
  await withMutedExpectedLog('error', () =>
    hit(callbackApp, 'GET', '/subscriptions/callback?Authority=x&Status=ok'),
  );
  callbackMode = 'success';
  await hit(callbackApp, 'GET', '/subscriptions/callback?authority=x&status=OK');
  await hit(callbackApp, 'GET', '/subscriptions/callback?Authority=x&Success=1');
  await hit(callbackApp, 'GET', '/subscriptions/callback?Authority=x&Success=true');
  await hit(callbackApp, 'GET', '/subscriptions/callback?Authority=x&Success=false');
}

async function exerciseWaitlistBranches(): Promise<void> {
  let catalog: any[] = [{ id: 'service-1' }];
  const app = appFor(
    waitlistRouter({
      serviceCatalog: { listServices: async () => catalog },
      availabilityConfig: { getBookingWindowDays: async () => 14 },
      waitlistService: { joinWaitlist: async (input: any) => input },
    } as unknown as Services),
    CUSTOMER,
  );
  await hit(app, 'POST', '/salons/salon-1/waitlist', {});
  await hit(app, 'POST', '/salons/salon-1/waitlist', {
    serviceId: 'service-1',
    windowStart: 'bad',
    windowEnd: 'bad',
  });
  const now = Date.now();
  const start = new Date(now + 60 * 60 * 1000).toISOString();
  const end = new Date(now + 2 * 60 * 60 * 1000).toISOString();
  catalog = [];
  await hit(app, 'POST', '/salons/salon-1/waitlist', {
    serviceId: 'service-1', windowStart: start, windowEnd: end,
  });
  catalog = [{ id: 'service-1' }];
  await hit(app, 'POST', '/salons/salon-1/waitlist', {
    serviceId: 'service-1', windowStart: new Date(now - 2 * 60 * 60 * 1000).toISOString(), windowEnd: new Date(now - 60 * 60 * 1000).toISOString(),
  });
  await hit(app, 'POST', '/salons/salon-1/waitlist', {
    serviceId: 'service-1', windowStart: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(), windowEnd: new Date(now + 31 * 24 * 60 * 60 * 1000).toISOString(),
  });
  await hit(app, 'POST', '/salons/salon-1/waitlist', { serviceId: 'service-1', windowStart: start, windowEnd: end });
}

When('I exercise controller branch matrix', async function (this: BackendWorld) {
  await exerciseSmallControllerBranches();
  this.controllerCovered.add('BRANCH_MATRIX');
});
