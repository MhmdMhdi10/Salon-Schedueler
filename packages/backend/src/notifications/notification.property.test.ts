/**
 * Feature: salon-booking-system, Property 17: Reminder channel selection
 *
 * For any customer with an appointment entering the Reminder_Lead_Time window,
 * an SMS reminder is dispatched, and a push reminder is additionally dispatched
 * if and only if that customer has push enabled with a registered device.
 *
 * **Validates: Requirements 12.2, 12.3**
 */
import * as fc from 'fast-check';
import { NotificationService } from './notification.service';
import type {
  NotificationRepository,
  AppointmentInfo,
  DeviceTokenInfo,
  NotificationLogEntry,
} from './notification.service';
import type { SmsProvider, SmsDeliveryResult } from '../auth/sms-provider.interface';
import type { PushProvider, PushPayload, PushDeliveryResult } from './push-provider.interface';

// ─── Test Doubles ──────────────────────────────────────────────────────────────

interface SmsSpy {
  calls: { phone: string; message: string }[];
  send(phone: string, message: string): Promise<SmsDeliveryResult>;
}

interface PushSpy {
  calls: { token: string; payload: PushPayload }[];
  send(token: string, payload: PushPayload): Promise<PushDeliveryResult>;
}

function createSmsSpy(): SmsSpy {
  const calls: { phone: string; message: string }[] = [];
  return {
    calls,
    async send(phone: string, message: string) {
      calls.push({ phone, message });
      return { ok: true as const, providerId: `sms-${calls.length}` };
    },
  };
}

function createPushSpy(): PushSpy {
  const calls: { token: string; payload: PushPayload }[] = [];
  return {
    calls,
    async send(token: string, payload: PushPayload) {
      calls.push({ token, payload });
      return { ok: true as const, providerId: `push-${calls.length}` };
    },
  };
}

// ─── Generators ────────────────────────────────────────────────────────────────

/** Generate a valid Iranian phone number */
const phoneArb = fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), {
  minLength: 10,
  maxLength: 10,
}).map((digits) => `+98${digits}`);

/** Generate a device token */
const deviceTokenArb = fc.hexaString({ minLength: 32, maxLength: 64 });

/** Generate a platform */
const platformArb = fc.constantFrom('android', 'ios');

/** Generate a device token entry with push enabled or disabled */
const deviceTokenInfoArb: fc.Arbitrary<DeviceTokenInfo> = fc.record({
  token: deviceTokenArb,
  platform: platformArb,
  pushEnabled: fc.boolean(),
});

/** Generate a list of device tokens (0 to 3 devices per customer) */
const deviceTokensArb: fc.Arbitrary<DeviceTokenInfo[]> = fc.array(deviceTokenInfoArb, {
  minLength: 0,
  maxLength: 3,
});

/** Generate an appointment info object */
const appointmentArb: fc.Arbitrary<AppointmentInfo> = fc.record({
  id: fc.uuid(),
  salonId: fc.uuid(),
  salonName: fc.string({ minLength: 1, maxLength: 30 }),
  customerId: fc.uuid(),
  customerPhone: phoneArb,
  customerName: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  serviceName: fc.stringOf(
    fc.constantFrom('ا', 'ب', 'ت', 'ث', 'ج', 'ح', 'خ', 'م', 'و', ' '),
    { minLength: 2, maxLength: 15 },
  ),
  startAt: fc.date({ min: new Date('2024-01-01'), max: new Date('2025-12-31') }),
  staffName: fc.option(fc.string({ minLength: 1, maxLength: 15 }), { nil: undefined }),
});

// ─── Property Test ─────────────────────────────────────────────────────────────

describe('Property 17: Reminder channel selection', () => {
  it('SMS is always dispatched, and push is dispatched iff customer has push enabled with a registered device', async () => {
    await fc.assert(
      fc.asyncProperty(
        appointmentArb,
        deviceTokensArb,
        async (appointment, deviceTokens) => {
          const smsSpy = createSmsSpy();
          const pushSpy = createPushSpy();

          const logs: Omit<NotificationLogEntry, 'id' | 'createdAt'>[] = [];
          let logCounter = 0;

          const repo: NotificationRepository = {
            findAppointment: async () => appointment,
            findSalonSmsRecipients: async () => [],
            findDeviceTokens: async () => deviceTokens,
            findAppointmentsInReminderWindow: async () => [appointment],
            registerDeviceToken: async () => { },
            logNotification: async (entry) => {
              logs.push(entry);
              logCounter++;
              return { id: `log-${logCounter}`, ...entry, createdAt: new Date() };
            },
          };

          const service = new NotificationService(smsSpy, pushSpy, repo);
          await service.sendReminder(appointment.id);

          // Property assertion 1: SMS is ALWAYS dispatched (R12.2)
          expect(smsSpy.calls.length).toBe(1);
          expect(smsSpy.calls[0].phone).toBe(appointment.customerPhone);

          // Property assertion 2: Push is dispatched iff customer has push
          // enabled with a registered device (R12.3)
          const enabledTokens = deviceTokens.filter((dt) => dt.pushEnabled);
          const hasPushEnabled = enabledTokens.length > 0;

          if (hasPushEnabled) {
            // Push should be dispatched for each enabled token
            expect(pushSpy.calls.length).toBe(enabledTokens.length);
            for (let i = 0; i < enabledTokens.length; i++) {
              expect(pushSpy.calls[i].token).toBe(enabledTokens[i].token);
            }
          } else {
            // No push should be dispatched
            expect(pushSpy.calls.length).toBe(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
