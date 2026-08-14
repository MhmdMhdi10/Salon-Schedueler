/**
 * Port for SMS delivery. Adapters (Kavenegar, SMS.ir, etc.)
 * implement this interface and are injected into AuthService.
 */
export interface SmsProvider {
  /**
   * Send an SMS message to the given phone number.
   * @returns a delivery result indicating success or failure.
   */
  send(phone: string, message: string): Promise<SmsDeliveryResult>;
}

export type SmsDeliveryResult =
  | { ok: true; providerId: string }
  | { ok: false; error: string };
