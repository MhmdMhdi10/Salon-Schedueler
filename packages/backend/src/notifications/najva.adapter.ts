import type { PushProvider, PushPayload, PushDeliveryResult } from './push-provider.interface';

/**
 * Najva push notification adapter — alternative local push provider
 * for the Iranian market.
 *
 * Requirements: R12.3
 */
export class NajvaAdapter implements PushProvider {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async send(token: string, payload: PushPayload): Promise<PushDeliveryResult> {
    try {
      const response = await this.callApi(token, payload);
      return { ok: true, providerId: response.notificationId };
    } catch (error: any) {
      return { ok: false, error: error.message ?? 'Najva delivery failed' };
    }
  }

  private async callApi(
    token: string,
    payload: PushPayload,
  ): Promise<{ notificationId: string }> {
    // Placeholder for real Najva API integration
    throw new Error('Najva adapter not configured for production use');
  }
}
