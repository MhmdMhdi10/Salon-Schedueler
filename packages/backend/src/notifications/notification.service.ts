import type { SmsProvider, SmsDeliveryResult } from '../auth/sms-provider.interface';
import type { PushProvider, PushPayload, PushDeliveryResult } from './push-provider.interface';

/**
 * Represents a stored appointment with the fields needed for notifications.
 */
export interface AppointmentInfo {
  id: string;
  salonId: string;
  salonName: string;
  customerId: string;
  customerPhone: string;
  customerName?: string;
  serviceName: string;
  startAt: Date;
  staffName?: string;
}

/**
 * Represents a customer's device token registration.
 */
export interface DeviceTokenInfo {
  token: string;
  platform: string;
  pushEnabled: boolean;
}

/**
 * A log entry for tracking notification delivery attempts.
 */
export interface NotificationLogEntry {
  id: string;
  appointmentId: string | null;
  /**
   * Delivery channel. `sms`/`push` are the original channels; `telegram`/`bale`
   * are the bot channels added by `Bot_Channel` (Requirements 1.9, 1.10).
   */
  channel: 'sms' | 'push' | 'telegram' | 'bale';
  status: 'sent' | 'failed';
  error: string | null;
  createdAt: Date;
}

/**
 * Repository port for notification-related data access.
 * The service doesn't depend directly on Prisma — it uses this abstraction
 * so tests can supply in-memory fakes.
 */
export interface NotificationRepository {
  /** Find appointment info by ID */
  findAppointment(appointmentId: string): Promise<AppointmentInfo | null>;

  /** Active salon-owner phone numbers that should receive booking alerts. */
  findSalonSmsRecipients(salonId: string): Promise<string[]>;

  /** Find device tokens for a customer */
  findDeviceTokens(customerId: string): Promise<DeviceTokenInfo[]>;

  /** Find appointments entering the reminder window */
  findAppointmentsInReminderWindow(
    now: Date,
    reminderLeadTimeMinutes: number,
  ): Promise<AppointmentInfo[]>;

  /** Log a notification delivery attempt */
  logNotification(entry: Omit<NotificationLogEntry, 'id' | 'createdAt'>): Promise<NotificationLogEntry>;

  /** Register a device token for a customer */
  registerDeviceToken(customerId: string, token: string, platform: string): Promise<void>;
}

/**
 * Configuration options for the NotificationService.
 */
export interface NotificationServiceOptions {
  /** Default reminder lead time in minutes. Default: 60 */
  defaultReminderLeadTimeMinutes?: number;
}

/**
 * NotificationService handles sending confirmations and reminders to customers.
 *
 * - Sends SMS confirmation on booking (R12.1)
 * - Sends SMS reminder when appointment enters Reminder_Lead_Time window (R12.2)
 * - Additionally sends push notification if customer has push enabled (R12.3)
 * - Logs SMS failures with no further fallback delivery (R12.4)
 *
 * Requirements: R12.1, R12.2, R12.3, R12.4
 */
export class NotificationService {
  private readonly smsProvider: SmsProvider;
  private readonly pushProvider: PushProvider;
  private readonly repository: NotificationRepository;
  private readonly defaultReminderLeadTimeMinutes: number;

  constructor(
    smsProvider: SmsProvider,
    pushProvider: PushProvider,
    repository: NotificationRepository,
    options?: NotificationServiceOptions,
  ) {
    this.smsProvider = smsProvider;
    this.pushProvider = pushProvider;
    this.repository = repository;
    this.defaultReminderLeadTimeMinutes =
      options?.defaultReminderLeadTimeMinutes ?? 60;
  }

  /**
   * Send a confirmation message after an appointment is confirmed.
   * Sends via SMS only. Logs success or failure.
   *
   * Requirements: R12.1
   */
  async sendConfirmation(appointmentId: string): Promise<void> {
    const appointment = await this.repository.findAppointment(appointmentId);
    if (!appointment) {
      return;
    }

    const message = this.buildConfirmationMessage(appointment);
    const result = await this.smsProvider.send(appointment.customerPhone, message);

    await this.repository.logNotification({
      appointmentId,
      channel: 'sms',
      status: result.ok ? 'sent' : 'failed',
      error: result.ok ? null : result.error,
    });
  }

  /**
   * Notify salon owners immediately when a customer submits a booking. Pending
   * requests ask for review; auto-confirmed/payment-confirmed bookings report
   * their final state. Customer delivery remains a separate message.
   */
  async sendSalonBookingNotice(
    appointmentId: string,
    status: 'pending' | 'confirmed',
  ): Promise<void> {
    const appointment = await this.repository.findAppointment(appointmentId);
    if (!appointment) return;

    const recipients = [...new Set(
      await this.repository.findSalonSmsRecipients(appointment.salonId),
    )];
    const message = this.buildSalonBookingMessage(appointment, status);
    for (const phone of recipients) {
      const result = await this.smsProvider.send(phone, message);
      await this.repository.logNotification({
        appointmentId,
        channel: 'sms',
        status: result.ok ? 'sent' : 'failed',
        error: result.ok ? null : result.error,
      });
    }
  }

  /**
   * Send a rejection notice after a salon admin declines a pending booking.
   * Sends via SMS only and logs success or failure. Best-effort, mirroring
   * {@link sendConfirmation}.
   */
  async sendRejection(appointmentId: string): Promise<void> {
    const appointment = await this.repository.findAppointment(appointmentId);
    if (!appointment) {
      return;
    }

    const message = this.buildRejectionMessage(appointment);
    const result = await this.smsProvider.send(appointment.customerPhone, message);

    await this.repository.logNotification({
      appointmentId,
      channel: 'sms',
      status: result.ok ? 'sent' : 'failed',
      error: result.ok ? null : result.error,
    });
  }

  /**
   * Send a cancellation notice to the booked customer after their appointment
   * is cancelled — e.g. when a stylist or admin cancels the slot, the customer
   * must be told (R12.x). Best-effort SMS, mirroring {@link sendConfirmation}:
   * it logs success/failure and never throws, so a notification failure can
   * never roll back the cancellation itself.
   */
  async sendCancellation(appointmentId: string): Promise<void> {
    const appointment = await this.repository.findAppointment(appointmentId);
    if (!appointment) {
      return;
    }

    const message = this.buildCancellationMessage(appointment);
    const result = await this.smsProvider.send(appointment.customerPhone, message);

    await this.repository.logNotification({
      appointmentId,
      channel: 'sms',
      status: result.ok ? 'sent' : 'failed',
      error: result.ok ? null : result.error,
    });
  }

  /**
   * Send a reminder for a specific appointment.
   * Always sends SMS (R12.2). Additionally sends push if customer has push
   * enabled with a registered device (R12.3).
   * On SMS failure, logs it with no further fallback (R12.4).
   *
   * Requirements: R12.2, R12.3, R12.4
   */
  async sendReminder(appointmentId: string): Promise<void> {
    const appointment = await this.repository.findAppointment(appointmentId);
    if (!appointment) {
      return;
    }

    // R12.2: Always send SMS reminder
    const smsMessage = this.buildReminderMessage(appointment);
    const smsResult = await this.smsProvider.send(appointment.customerPhone, smsMessage);

    await this.repository.logNotification({
      appointmentId,
      channel: 'sms',
      status: smsResult.ok ? 'sent' : 'failed',
      error: smsResult.ok ? null : smsResult.error,
    });

    // R12.4: If SMS fails, log failure and do NOT attempt further delivery
    // (no fallback — the failure is already logged above)

    // R12.3: Additionally send push if customer has push enabled with a registered device
    const deviceTokens = await this.repository.findDeviceTokens(appointment.customerId);
    const enabledTokens = deviceTokens.filter((dt) => dt.pushEnabled);

    if (enabledTokens.length > 0) {
      const pushPayload: PushPayload = {
        title: 'یادآوری نوبت',
        body: this.buildReminderMessage(appointment),
      };

      for (const dt of enabledTokens) {
        const pushResult = await this.pushProvider.send(dt.token, pushPayload);

        await this.repository.logNotification({
          appointmentId,
          channel: 'push',
          status: pushResult.ok ? 'sent' : 'failed',
          error: pushResult.ok ? null : pushResult.error,
        });
      }
    }
  }

  /**
   * Worker that scans appointments entering the Reminder_Lead_Time window
   * and dispatches reminders.
   *
   * This should be called periodically (e.g., every minute) by the scheduler.
   * It finds appointments whose start time falls within [now, now + reminderLeadTime)
   * and sends reminders for them.
   *
   * Requirements: R12.2
   */
  async dispatchReminders(
    now: Date,
    reminderLeadTimeMinutes?: number,
  ): Promise<number> {
    const leadTime = reminderLeadTimeMinutes ?? this.defaultReminderLeadTimeMinutes;
    const appointments = await this.repository.findAppointmentsInReminderWindow(now, leadTime);

    for (const appointment of appointments) {
      await this.sendReminder(appointment.id);
    }

    return appointments.length;
  }

  /**
   * Register a device token for push notifications.
   *
   * Requirements: R12.3
   */
  async registerDeviceToken(
    customerId: string,
    token: string,
    platform: string,
  ): Promise<void> {
    await this.repository.registerDeviceToken(customerId, token, platform);
  }

  private buildConfirmationMessage(appointment: AppointmentInfo): string {
    const dateStr = appointment.startAt.toLocaleDateString('fa-IR');
    const timeStr = appointment.startAt.toLocaleTimeString('fa-IR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `نوبت شما در ${appointment.salonName} برای ${appointment.serviceName} در تاریخ ${dateStr} ساعت ${timeStr} تأیید شد.`;
  }

  private buildRejectionMessage(appointment: AppointmentInfo): string {
    const dateStr = appointment.startAt.toLocaleDateString('fa-IR');
    const timeStr = appointment.startAt.toLocaleTimeString('fa-IR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `متأسفانه درخواست نوبت شما در ${appointment.salonName} برای ${appointment.serviceName} در تاریخ ${dateStr} ساعت ${timeStr} تأیید نشد. لطفاً زمان دیگری را انتخاب کنید.`;
  }

  private buildCancellationMessage(appointment: AppointmentInfo): string {
    const dateStr = appointment.startAt.toLocaleDateString('fa-IR');
    const timeStr = appointment.startAt.toLocaleTimeString('fa-IR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `نوبت شما در ${appointment.salonName} برای ${appointment.serviceName} در تاریخ ${dateStr} ساعت ${timeStr} لغو شد. برای رزرو زمانی دیگر می‌توانید دوباره اقدام کنید.`;
  }

  private buildReminderMessage(appointment: AppointmentInfo): string {
    const timeStr = appointment.startAt.toLocaleTimeString('fa-IR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `یادآوری ${appointment.salonName}: نوبت ${appointment.serviceName} ساعت ${timeStr} نزدیک است.`;
  }

  private buildSalonBookingMessage(
    appointment: AppointmentInfo,
    status: 'pending' | 'confirmed',
  ): string {
    const dateStr = appointment.startAt.toLocaleDateString('fa-IR');
    const timeStr = appointment.startAt.toLocaleTimeString('fa-IR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const customer = appointment.customerName?.trim() || appointment.customerPhone;
    const staff = appointment.staffName ? ` با ${appointment.staffName}` : '';
    const state = status === 'pending' ? 'منتظر تأیید شما در پنل است.' : 'به‌صورت خودکار تأیید شد.';
    return `رزرو جدید ${appointment.salonName}: ${customer}، ${appointment.serviceName}${staff}، تاریخ ${dateStr} ساعت ${timeStr}. ${state}`;
  }
}
