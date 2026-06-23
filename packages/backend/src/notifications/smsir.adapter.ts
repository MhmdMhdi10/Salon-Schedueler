import type { SmsProvider, SmsDeliveryResult } from '../auth/sms-provider.interface';

/**
 * SMS.ir adapter — alternative SMS provider for the Iranian market.
 *
 * In production this calls the SMS.ir API. For development and testing,
 * instantiate with a mock or use the LocalSmsAdapter.
 *
 * Requirements: R12.1
 */
export class SmsIrAdapter implements SmsProvider {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async send(phone: string, message: string): Promise<SmsDeliveryResult> {
    try {
      const response = await this.callApi(phone, message);
      return { ok: true, providerId: response.messageId };
    } catch (error: any) {
      return { ok: false, error: error.message ?? 'SMS.ir delivery failed' };
    }
  }

  private async callApi(
    phone: string,
    message: string,
  ): Promise<{ messageId: string }> {
    // Placeholder for real SMS.ir API integration
    throw new Error('SMS.ir adapter not configured for production use');
  }
}
