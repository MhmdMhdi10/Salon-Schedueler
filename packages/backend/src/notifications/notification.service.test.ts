import { NotificationService } from './notification.service';
import type {
  NotificationRepository,
  AppointmentInfo,
  DeviceTokenInfo,
  NotificationLogEntry,
} from './notification.service';
import type { SmsProvider, SmsDeliveryResult } from '../auth/sms-provider.interface';
import type { PushProvider, PushPayload, PushDeliveryResult } from './push-provider.interface';

// ─── Test Helpers ──────────────────────────────────────────────────────────────

function createMockSmsProvider(result?: SmsDeliveryResult): SmsProvider & { calls: { phone: string; message: string }[] } {
  const calls: { phone: string; message: string }[] = [];
  return {
    calls,
    async send(phone: string, message: string): Promise<SmsDeliveryResult> {
      calls.push({ phone, message });
      return result ?? { ok: true, providerId: 'sms-123' };
    },
  };
}

function createMockPushProvider(result?: PushDeliveryResult): PushProvider & { calls: { token: string; payload: PushPayload }[] } {
  const calls: { token: string; payload: PushPayload }[] = [];
  return {
    calls,
    async send(token: string, payload: PushPayload): Promise<PushDeliveryResult> {
      calls.push({ token, payload });
      return result ?? { ok: true, providerId: 'push-456' };
    },
  };
}

function createMockRepository(overrides?: Partial<NotificationRepository>): NotificationRepository & { logs: Omit<NotificationLogEntry, 'id' | 'createdAt'>[] } {
  const logs: Omit<NotificationLogEntry, 'id' | 'createdAt'>[] = [];
  let logCounter = 0;

  return {
    logs,
    findAppointment: overrides?.findAppointment ?? (async () => null),
    findSalonSmsRecipients: overrides?.findSalonSmsRecipients ?? (async () => []),
    findDeviceTokens: overrides?.findDeviceTokens ?? (async () => []),
    findAppointmentsInReminderWindow: overrides?.findAppointmentsInReminderWindow ?? (async () => []),
    registerDeviceToken: overrides?.registerDeviceToken ?? (async () => {}),
    logNotification: overrides?.logNotification ?? (async (entry) => {
      logs.push(entry);
      logCounter++;
      return {
        id: `log-${logCounter}`,
        ...entry,
        createdAt: new Date(),
      };
    }),
  };
}

const sampleAppointment: AppointmentInfo = {
  id: 'appt-1',
  salonId: 'salon-1',
  salonName: 'سالن آرا',
  customerId: 'cust-1',
  customerPhone: '+989121234567',
  customerName: 'علی محمدی',
  serviceName: 'کوتاهی مو',
  startAt: new Date('2024-06-15T10:00:00Z'),
  staffName: 'حسین',
};

// ─── Tests: sendConfirmation (Task 12.2 / R12.1) ──────────────────────────────

describe('NotificationService', () => {
  describe('sendConfirmation', () => {
    it('sends an SMS confirmation and logs success', async () => {
      const sms = createMockSmsProvider({ ok: true, providerId: 'kavnegar-001' });
      const push = createMockPushProvider();
      const repo = createMockRepository({
        findAppointment: async () => sampleAppointment,
      });

      const service = new NotificationService(sms, push, repo);
      await service.sendConfirmation('appt-1');

      expect(sms.calls).toHaveLength(1);
      expect(sms.calls[0].phone).toBe('+989121234567');
      expect(sms.calls[0].message).toContain('کوتاهی مو');
      expect(sms.calls[0].message).toContain('سالن آرا');
      expect(repo.logs).toHaveLength(1);
      expect(repo.logs[0]).toMatchObject({
        appointmentId: 'appt-1',
        channel: 'sms',
        status: 'sent',
        error: null,
      });
    });

    it('does nothing when appointment is not found', async () => {
      const sms = createMockSmsProvider();
      const push = createMockPushProvider();
      const repo = createMockRepository({
        findAppointment: async () => null,
      });

      const service = new NotificationService(sms, push, repo);
      await service.sendConfirmation('non-existent');

      expect(sms.calls).toHaveLength(0);
      expect(repo.logs).toHaveLength(0);
    });
  });

  describe('sendSalonBookingNotice', () => {
    it('sends pending booking details to each unique salon owner phone', async () => {
      const sms = createMockSmsProvider();
      const repo = createMockRepository({
        findAppointment: async () => sampleAppointment,
        findSalonSmsRecipients: async () => ['09120000000', '09120000000'],
      });
      const service = new NotificationService(sms, createMockPushProvider(), repo);

      await service.sendSalonBookingNotice('appt-1', 'pending');

      expect(sms.calls).toHaveLength(1);
      expect(sms.calls[0].phone).toBe('09120000000');
      expect(sms.calls[0].message).toContain('رزرو جدید سالن آرا');
      expect(sms.calls[0].message).toContain('منتظر تأیید شما');
    });
  });

  // ─── Tests: sendReminder (Task 12.2 / R12.2, R12.3) ─────────────────────────

  describe('sendReminder', () => {
    it('sends SMS reminder and push when customer has push enabled', async () => {
      const sms = createMockSmsProvider({ ok: true, providerId: 'sms-ok' });
      const push = createMockPushProvider({ ok: true, providerId: 'push-ok' });
      const deviceTokens: DeviceTokenInfo[] = [
        { token: 'device-token-abc', platform: 'android', pushEnabled: true },
      ];
      const repo = createMockRepository({
        findAppointment: async () => sampleAppointment,
        findDeviceTokens: async () => deviceTokens,
      });

      const service = new NotificationService(sms, push, repo);
      await service.sendReminder('appt-1');

      // SMS was sent
      expect(sms.calls).toHaveLength(1);
      expect(sms.calls[0].phone).toBe('+989121234567');

      // Push was sent (R12.3: additionally)
      expect(push.calls).toHaveLength(1);
      expect(push.calls[0].token).toBe('device-token-abc');
      expect(push.calls[0].payload.title).toBe('یادآوری نوبت');

      // Both logged
      expect(repo.logs).toHaveLength(2);
      expect(repo.logs[0]).toMatchObject({ channel: 'sms', status: 'sent' });
      expect(repo.logs[1]).toMatchObject({ channel: 'push', status: 'sent' });
    });

    it('sends SMS only when customer has no push enabled', async () => {
      const sms = createMockSmsProvider({ ok: true, providerId: 'sms-ok' });
      const push = createMockPushProvider();
      const repo = createMockRepository({
        findAppointment: async () => sampleAppointment,
        findDeviceTokens: async () => [], // no device tokens
      });

      const service = new NotificationService(sms, push, repo);
      await service.sendReminder('appt-1');

      expect(sms.calls).toHaveLength(1);
      expect(push.calls).toHaveLength(0);
      expect(repo.logs).toHaveLength(1);
      expect(repo.logs[0]).toMatchObject({ channel: 'sms', status: 'sent' });
    });

    it('sends SMS only when push is disabled for device', async () => {
      const sms = createMockSmsProvider({ ok: true, providerId: 'sms-ok' });
      const push = createMockPushProvider();
      const deviceTokens: DeviceTokenInfo[] = [
        { token: 'device-token-xyz', platform: 'android', pushEnabled: false },
      ];
      const repo = createMockRepository({
        findAppointment: async () => sampleAppointment,
        findDeviceTokens: async () => deviceTokens,
      });

      const service = new NotificationService(sms, push, repo);
      await service.sendReminder('appt-1');

      expect(sms.calls).toHaveLength(1);
      expect(push.calls).toHaveLength(0); // push disabled
      expect(repo.logs).toHaveLength(1);
      expect(repo.logs[0]).toMatchObject({ channel: 'sms', status: 'sent' });
    });
  });

  // ─── Tests: SMS-failure logging (Task 12.4 / R12.4) ─────────────────────────

  describe('SMS-failure logging (R12.4)', () => {
    it('logs failure and makes no further delivery attempts on SMS failure', async () => {
      const sms = createMockSmsProvider({ ok: false, error: 'Network timeout' });
      const push = createMockPushProvider();
      const deviceTokens: DeviceTokenInfo[] = [
        { token: 'device-token-abc', platform: 'android', pushEnabled: true },
      ];
      const repo = createMockRepository({
        findAppointment: async () => sampleAppointment,
        findDeviceTokens: async () => deviceTokens,
      });

      const service = new NotificationService(sms, push, repo);
      await service.sendReminder('appt-1');

      // SMS was attempted exactly once
      expect(sms.calls).toHaveLength(1);

      // Failure was logged
      const smsLogs = repo.logs.filter((l) => l.channel === 'sms');
      expect(smsLogs).toHaveLength(1);
      expect(smsLogs[0]).toMatchObject({
        appointmentId: 'appt-1',
        channel: 'sms',
        status: 'failed',
        error: 'Network timeout',
      });

      // No further SMS delivery attempts were made (R12.4: no fallback)
      // The SMS provider was called only once
      expect(sms.calls).toHaveLength(1);
    });

    it('logs exactly one failure row when confirmation SMS fails', async () => {
      const sms = createMockSmsProvider({ ok: false, error: 'Provider unreachable' });
      const push = createMockPushProvider();
      const repo = createMockRepository({
        findAppointment: async () => sampleAppointment,
      });

      const service = new NotificationService(sms, push, repo);
      await service.sendConfirmation('appt-1');

      expect(sms.calls).toHaveLength(1);
      expect(repo.logs).toHaveLength(1);
      expect(repo.logs[0]).toMatchObject({
        appointmentId: 'appt-1',
        channel: 'sms',
        status: 'failed',
        error: 'Provider unreachable',
      });
    });
  });

  // ─── Tests: dispatchReminders (Task 12.2 / R12.2) ───────────────────────────

  describe('dispatchReminders', () => {
    it('dispatches reminders for all appointments in the reminder window', async () => {
      const appt1: AppointmentInfo = { ...sampleAppointment, id: 'appt-1' };
      const appt2: AppointmentInfo = { ...sampleAppointment, id: 'appt-2', customerPhone: '+989129999999' };

      const sms = createMockSmsProvider({ ok: true, providerId: 'sms-ok' });
      const push = createMockPushProvider();
      const repo = createMockRepository({
        findAppointment: async (id) => (id === 'appt-1' ? appt1 : appt2),
        findAppointmentsInReminderWindow: async () => [appt1, appt2],
        findDeviceTokens: async () => [],
      });

      const service = new NotificationService(sms, push, repo);
      const count = await service.dispatchReminders(new Date(), 60);

      expect(count).toBe(2);
      expect(sms.calls).toHaveLength(2);
    });

    it('returns 0 when no appointments are in the window', async () => {
      const sms = createMockSmsProvider();
      const push = createMockPushProvider();
      const repo = createMockRepository({
        findAppointmentsInReminderWindow: async () => [],
      });

      const service = new NotificationService(sms, push, repo);
      const count = await service.dispatchReminders(new Date(), 60);

      expect(count).toBe(0);
      expect(sms.calls).toHaveLength(0);
    });
  });
});
