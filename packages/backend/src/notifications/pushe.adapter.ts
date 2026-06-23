import type { PushProvider, PushPayload, PushDeliveryResult } from './push-provider.interface';

/**
 * Pushe push notification adapter — local push provider for the Iranian market.
 * Works on devices without Google Play Services.
 *
 * Requirements: R12.3
 */
export class PusheAdapter implements PushProvider {
  private readonly appId: string;

  constructor(appId: string) {
    this.appId = appId;
  }

  async send(token: string, payload: PushPayload): Promise<PushDeliveryResult> {
    try {
      const response = await this.callApi(token, payload);
      return { ok: true, providerId: response.notificationId };
    } catch (error: any) {
      return { ok: false, error: error.message ?? 'Pushe delivery failed' };
    }
  }

  private async callApi(
    token: string,
    payload: PushPayload,
  ): Promise<{ notificationId: string }> {
    // Placeholder for real Pushe API integration
    throw new Error('Pushe adapter not configured for production use');
  }
}
