import type { PrismaClient } from '@prisma/client';

export type SmsNotificationEvent = 'booking' | 'reminder' | 'cancellation';

export interface SmsSettings {
  ownerBooking: boolean;
  stylistBooking: boolean;
  ownerReminder: boolean;
  stylistReminder: boolean;
  ownerCancellation: boolean;
  stylistCancellation: boolean;
}

export const DEFAULT_SMS_SETTINGS: SmsSettings = {
  ownerBooking: false,
  stylistBooking: true,
  ownerReminder: false,
  stylistReminder: true,
  ownerCancellation: false,
  stylistCancellation: true,
};

/** Persists role-based SMS delivery preferences for one salon. */
export class NotificationSettingsService {
  constructor(private readonly prisma: PrismaClient) {}

  async getSmsSettings(salonId: string): Promise<SmsSettings> {
    const row = await this.prisma.salonSmsSettings.findUnique({ where: { salonId } });
    return row ? this.toSettings(row) : DEFAULT_SMS_SETTINGS;
  }

  async updateSmsSettings(
    salonId: string,
    patch: Partial<SmsSettings>,
  ): Promise<SmsSettings> {
    const row = await this.prisma.salonSmsSettings.upsert({
      where: { salonId },
      create: { salonId, ...DEFAULT_SMS_SETTINGS, ...patch },
      update: patch,
    });
    return this.toSettings(row);
  }

  private toSettings(row: SmsSettings): SmsSettings {
    return {
      ownerBooking: row.ownerBooking,
      stylistBooking: row.stylistBooking,
      ownerReminder: row.ownerReminder,
      stylistReminder: row.stylistReminder,
      ownerCancellation: row.ownerCancellation,
      stylistCancellation: row.stylistCancellation,
    };
  }
}
