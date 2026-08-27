import type {
  SmsProvider,
  SmsTemplateProvider,
  SmsDeliveryResult,
} from '../auth/sms-provider.interface';
import type { PushProvider, PushPayload, PushDeliveryResult } from './push-provider.interface';
import type { SmsNotificationEvent } from './notification-settings.service.js';
import {
  MELLI_PAYAMAK_TEMPLATE_BODY_IDS,
  type MelliPayamakNotificationTemplate,
} from './melipayamak-template-body-ids.js';

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
  staffMemberId?: string;
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
  /** Semantic event used for durable idempotency (older fakes may omit it). */
  type?:
    | 'confirmation'
    | 'reminder'
    | 'rejection'
    | 'cancellation'
    | 'booking_notice'
    | 'generic';
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

  /** Configured owner/stylist recipients for one appointment and event. */
  findSmsRecipientsForAppointment?: (
    appointmentId: string,
    event: SmsNotificationEvent,
  ) => Promise<string[]>;

  /** Find device tokens for a customer */
  findDeviceTokens(customerId: string): Promise<DeviceTokenInfo[]>;

  /** Find appointments entering the reminder window */
  findAppointmentsInReminderWindow(
    now: Date,
    reminderLeadTimeMinutes: number,
  ): Promise<AppointmentInfo[]>;

  /** Log a notification delivery attempt */
  logNotification(entry: Omit<NotificationLogEntry, 'id' | 'createdAt'>): Promise<NotificationLogEntry>;

  /** Return true after a successful delivery of the same event/channel. */
  hasSentNotification?: (
    appointmentId: string,
    type: NonNullable<NotificationLogEntry['type']>,
    channel: NotificationLogEntry['channel'],
  ) => Promise<boolean>;

  /** Register a device token for a customer */
  registerDeviceToken(customerId: string, token: string, platform: string): Promise<void>;
}

/**
 * Configuration options for the NotificationService.
 */
export interface NotificationServiceOptions {
  /** Default reminder lead time in minutes. Default: 60 */
  defaultReminderLeadTimeMinutes?: number;
  /** Shared-template SMS provider used for fixed notification messages. */
  templateProvider?: SmsTemplateProvider;
  /** Optional overrides for approved shared-template body ids. */
  templateBodyIds?: Partial<Record<MelliPayamakNotificationTemplate, number>>;
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
  private readonly templateProvider?: SmsTemplateProvider;
  private readonly templateBodyIds: Record<MelliPayamakNotificationTemplate, number>;
  private readonly remindersInFlight = new Set<string>();

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
    this.templateProvider = options?.templateProvider;
    this.templateBodyIds = {
      confirmation: MELLI_PAYAMAK_TEMPLATE_BODY_IDS.confirmation,
      rejection: MELLI_PAYAMAK_TEMPLATE_BODY_IDS.rejection,
      customerCancellation: MELLI_PAYAMAK_TEMPLATE_BODY_IDS.customerCancellation,
      customerReminder: MELLI_PAYAMAK_TEMPLATE_BODY_IDS.customerReminder,
      bookingNotice: MELLI_PAYAMAK_TEMPLATE_BODY_IDS.bookingNotice,
      staffCancellation: MELLI_PAYAMAK_TEMPLATE_BODY_IDS.staffCancellation,
      staffReminder: MELLI_PAYAMAK_TEMPLATE_BODY_IDS.staffReminder,
      ...options?.templateBodyIds,
    };
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
    const { dateStr, timeStr } = this.getAppointmentDateTime(appointment);
    const result = await this.sendFixedSms(
      appointment.customerPhone,
      'confirmation',
      message,
      [appointment.salonName, timeStr, dateStr],
    );

    await this.repository.logNotification({
      appointmentId,
      channel: 'sms',
      type: 'confirmation',
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

    const recipients = [...new Set(await this.findStaffRecipients(appointment, 'booking'))];
    const message = this.buildSalonBookingMessage(appointment, status);
    const { dateStr, timeStr } = this.getAppointmentDateTime(appointment);
    const customer = appointment.customerName?.trim() || appointment.customerPhone;
    const staff = appointment.staffName?.trim() || 'بدون آرایشگر';
    const state = status === 'pending' ? 'منتظر تأیید شما در پنل است.' : 'به‌صورت خودکار تأیید شد.';
    for (const phone of recipients) {
      const result = await this.sendFixedSms(
        phone,
        'bookingNotice',
        message,
        [appointment.salonName, customer, state, staff, dateStr, timeStr],
      );
      await this.repository.logNotification({
        appointmentId,
        channel: 'sms',
        type: 'booking_notice',
        status: result.ok ? 'sent' : 'failed',
        error: result.ok ? null : result.error,
      });
    }
  }

  /**
   * Send a staff-authored SMS to the customer attached to an appointment.
   * Delivery is logged as a generic notification so the action remains
   * auditable without exposing the customer's phone number to the client.
   */
  async sendCustomerMessage(
    appointmentId: string,
    message: string,
  ): Promise<SmsDeliveryResult | null> {
    const appointment = await this.repository.findAppointment(appointmentId);
    if (!appointment) return null;

    const result = await this.smsProvider.send(appointment.customerPhone, message);
    await this.repository.logNotification({
      appointmentId,
      channel: 'sms',
      type: 'generic',
      status: result.ok ? 'sent' : 'failed',
      error: result.ok ? null : result.error,
    });
    return result;
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
    const { dateStr, timeStr } = this.getAppointmentDateTime(appointment);
    const result = await this.sendFixedSms(
      appointment.customerPhone,
      'rejection',
      message,
      [appointment.salonName, timeStr, dateStr],
    );

    await this.repository.logNotification({
      appointmentId,
      channel: 'sms',
      type: 'rejection',
      status: result.ok ? 'sent' : 'failed',
      error: result.ok ? null : result.error,
    });

    await this.sendStaffNotice(
      appointment,
      'cancellation',
      this.buildStaffCancellationMessage(appointment),
    );
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
    const { dateStr, timeStr } = this.getAppointmentDateTime(appointment);
    const result = await this.sendFixedSms(
      appointment.customerPhone,
      'customerCancellation',
      message,
      [appointment.salonName, timeStr, dateStr],
    );

    await this.repository.logNotification({
      appointmentId,
      channel: 'sms',
      type: 'cancellation',
      status: result.ok ? 'sent' : 'failed',
      error: result.ok ? null : result.error,
    });

    await this.sendStaffNotice(
      appointment,
      'cancellation',
      this.buildStaffCancellationMessage(appointment),
    );
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
    if (this.remindersInFlight.has(appointmentId)) return;
    this.remindersInFlight.add(appointmentId);

    try {
      const appointment = await this.repository.findAppointment(appointmentId);
      if (!appointment) return;

      if (
        this.repository.hasSentNotification &&
        (await this.repository.hasSentNotification(appointmentId, 'reminder', 'sms'))
      ) {
        return;
      }

      // R12.2: Always send SMS reminder
      const smsMessage = this.buildReminderMessage(appointment);
      const { timeStr } = this.getAppointmentDateTime(appointment);
      const smsResult = await this.sendFixedSms(
        appointment.customerPhone,
        'customerReminder',
        smsMessage,
        [appointment.salonName, timeStr],
      );

      await this.repository.logNotification({
        appointmentId,
        channel: 'sms',
        type: 'reminder',
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
            type: 'reminder',
            status: pushResult.ok ? 'sent' : 'failed',
            error: pushResult.ok ? null : pushResult.error,
          });
        }
      }

      await this.sendStaffNotice(
        appointment,
        'reminder',
        this.buildStaffReminderMessage(appointment),
      );
    } finally {
      this.remindersInFlight.delete(appointmentId);
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
    const { dateStr, timeStr } = this.getAppointmentDateTime(appointment);
    return `نوبت شما در ${appointment.salonName} برای ${appointment.serviceName} در تاریخ ${dateStr} ساعت ${timeStr} تأیید شد.`;
  }

  private buildRejectionMessage(appointment: AppointmentInfo): string {
    const { dateStr, timeStr } = this.getAppointmentDateTime(appointment);
    return `متأسفانه درخواست نوبت شما در ${appointment.salonName} برای ${appointment.serviceName} در تاریخ ${dateStr} ساعت ${timeStr} تأیید نشد. لطفاً زمان دیگری را انتخاب کنید.`;
  }

  private buildCancellationMessage(appointment: AppointmentInfo): string {
    const { dateStr, timeStr } = this.getAppointmentDateTime(appointment);
    return `نوبت شما در ${appointment.salonName} برای ${appointment.serviceName} در تاریخ ${dateStr} ساعت ${timeStr} لغو شد. برای رزرو زمانی دیگر می‌توانید دوباره اقدام کنید.`;
  }

  private buildReminderMessage(appointment: AppointmentInfo): string {
    const { timeStr } = this.getAppointmentDateTime(appointment);
    return `یادآوری ${appointment.salonName}: نوبت ${appointment.serviceName} ساعت ${timeStr} نزدیک است.`;
  }

  private buildSalonBookingMessage(
    appointment: AppointmentInfo,
    status: 'pending' | 'confirmed',
  ): string {
    const { dateStr, timeStr } = this.getAppointmentDateTime(appointment);
    const customer = appointment.customerName?.trim() || appointment.customerPhone;
    const staff = appointment.staffName ? ` با ${appointment.staffName}` : '';
    const state = status === 'pending' ? 'منتظر تأیید شما در پنل است.' : 'به‌صورت خودکار تأیید شد.';
    return `رزرو جدید ${appointment.salonName}: ${customer}، ${appointment.serviceName}${staff}، تاریخ ${dateStr} ساعت ${timeStr}. ${state}`;
  }

  private async findStaffRecipients(
    appointment: AppointmentInfo,
    event: SmsNotificationEvent,
  ): Promise<string[]> {
    if (this.repository.findSmsRecipientsForAppointment) {
      return this.repository.findSmsRecipientsForAppointment(appointment.id, event);
    }
    // Compatibility fallback for older adapters and unit-test fakes. Only the
    // legacy booking path had an owner-recipient contract; do not accidentally
    // turn reminders/cancellations on for an adapter that has no settings API.
    return event === 'booking'
      ? this.repository.findSalonSmsRecipients(appointment.salonId)
      : [];
  }

  private async sendStaffNotice(
    appointment: AppointmentInfo,
    event: 'reminder' | 'cancellation',
    message: string,
  ): Promise<void> {
    const recipients = [...new Set(await this.findStaffRecipients(appointment, event))];
    const customer = appointment.customerName?.trim() || appointment.customerPhone;
    const { timeStr } = this.getAppointmentDateTime(appointment);
    const template = event === 'reminder' ? 'staffReminder' : 'staffCancellation';
    const args = event === 'reminder'
      ? [appointment.salonName, customer, timeStr]
      : [appointment.salonName, customer];
    for (const phone of recipients) {
      const result = await this.sendFixedSms(phone, template, message, args);
      await this.repository.logNotification({
        appointmentId: appointment.id,
        channel: 'sms',
        type: event,
        status: result.ok ? 'sent' : 'failed',
        error: result.ok ? null : result.error,
      });
    }
  }

  private buildStaffCancellationMessage(appointment: AppointmentInfo): string {
    const customer = appointment.customerName?.trim() || appointment.customerPhone;
    return `لغو نوبت ${appointment.salonName}: ${customer}، ${appointment.serviceName}. زمان رزرو آزاد شد.`;
  }

  private buildStaffReminderMessage(appointment: AppointmentInfo): string {
    const customer = appointment.customerName?.trim() || appointment.customerPhone;
    const { timeStr } = this.getAppointmentDateTime(appointment);
    return `یادآوری ${appointment.salonName}: نوبت ${customer} برای ${appointment.serviceName} ساعت ${timeStr} نزدیک است.`;
  }

  private getAppointmentDateTime(appointment: AppointmentInfo): {
    dateStr: string;
    timeStr: string;
  } {
    return {
      dateStr: appointment.startAt.toLocaleDateString('fa-IR'),
      timeStr: appointment.startAt.toLocaleTimeString('fa-IR', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };
  }

  private sendFixedSms(
    phone: string,
    template: MelliPayamakNotificationTemplate,
    fallbackMessage: string,
    args: string[],
  ): Promise<SmsDeliveryResult> {
    const bodyId = this.templateBodyIds[template];
    if (this.templateProvider && Number.isInteger(bodyId) && bodyId > 0) {
      return this.templateProvider.sendTemplate(phone, bodyId, args);
    }
    return this.smsProvider.send(phone, fallbackMessage);
  }
}
