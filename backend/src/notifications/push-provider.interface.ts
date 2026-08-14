/**
 * Payload for push notifications.
 */
export interface PushPayload {
  title: string;
  body: string;
}

/**
 * Result of a push delivery attempt.
 */
export type PushDeliveryResult =
  | { ok: true; providerId: string }
  | { ok: false; error: string };

/**
 * Port for push notification delivery. Adapters (Pushe, Najva, FCM)
 * implement this interface and are injected into NotificationService.
 *
 * Requirements: R12.3
 */
export interface PushProvider {
  /**
   * Send a push notification to the given device token.
   * @param token - The device token for the target device
   * @param payload - The notification title and body
   * @returns a delivery result indicating success or failure
   */
  send(token: string, payload: PushPayload): Promise<PushDeliveryResult>;
}
