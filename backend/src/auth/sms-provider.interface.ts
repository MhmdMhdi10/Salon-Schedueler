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

/**
 * Provider port for positional shared SMS templates. `args[0]` replaces
 * `{0}`, `args[1]` replaces `{1}`, and so on.
 */
export interface SmsTemplateProvider {
  sendTemplate(
    phone: string,
    bodyId: number,
    args: string[],
  ): Promise<SmsDeliveryResult>;
}

export type SmsDeliveryResult =
  | { ok: true; providerId: string }
  | { ok: false; error: string };
