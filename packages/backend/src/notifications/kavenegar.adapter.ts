import type { SmsProvider, SmsDeliveryResult } from '../auth/sms-provider.interface';

/**
 * Kavenegar SMS adapter — primary SMS provider for the Iranian market.
 *
 * In production this calls the Kavenegar API. For development and testing,
 * instantiate with a mock or use the LocalSmsAdapter.
 *
 * Requirements: R12.1
 */
export class KavenegarSmsAdapter implements SmsProvider {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async send(phone: string, message: string): Promise<SmsDeliveryResult> {
    try {
      // Production: POST https://api.kavenegar.com/v1/{apiKey}/sms/send.json
      // For now this is a placeholder — real HTTP call would go here
      const response = await this.callApi(phone, message);
      return { ok: true, providerId: response.messageId };
    } catch (error: any) {
      return { ok: false, error: error.message ?? 'Kavenegar delivery failed' };
    }
  }

  private async callApi(
    phone: string,
    message: string,
  ): Promise<{ messageId: string }> {
    // Placeholder for real Kavenegar API integration
    // In tests, this class is replaced by a mock/fake
    throw new Error('Kavenegar adapter not configured for production use');
  }
}
