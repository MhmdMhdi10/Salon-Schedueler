import type { SmsProvider, SmsDeliveryResult } from '../auth/sms-provider.interface.js';
import type {
  PushProvider,
  PushPayload,
  PushDeliveryResult,
} from '../notifications/push-provider.interface.js';

/**
 * Development SMS provider that logs the message instead of calling a real
 * provider. Selected by the Composition_Root when no SMS credentials are present
 * so the system still runs locally without provider accounts (Requirement 5.5).
 *
 * Always returns a success result so notification flows behave as in production.
 * These dev providers are replaced by real configured adapters in Task 7.
 */
export class DevLogSmsProvider implements SmsProvider {
  async send(phone: string, message: string): Promise<SmsDeliveryResult> {
    // eslint-disable-next-line no-console
    console.log(`[dev-sms] -> ${phone}: ${message}`);

    const inboxUrl = process.env.DEV_SMS_INBOX_URL;
    if (inboxUrl) {
      try {
        const response = await fetch(`${inboxUrl.replace(/\/$/, '')}/api/messages`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ phone, message, provider: 'dev-log' }),
          signal: AbortSignal.timeout(2_000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
      } catch (error) {
        // Inbox is observability-only: never break OTP/notification flows when
        // the local dashboard is stopped or restarting.
        // eslint-disable-next-line no-console
        console.warn('[dev-sms] inbox capture failed:', error instanceof Error ? error.message : error);
      }
    }
    return { ok: true, providerId: 'dev-log' };
  }
}

/**
 * Development push provider that logs the payload instead of calling a real
 * provider. Selected by the Composition_Root when no push credentials are present
 * (Requirement 5.5).
 */
export class DevLogPushProvider implements PushProvider {
  async send(token: string, payload: PushPayload): Promise<PushDeliveryResult> {
    // eslint-disable-next-line no-console
    console.log(`[dev-push] -> ${token}: ${payload.title} — ${payload.body}`);
    return { ok: true, providerId: 'dev-log' };
  }
}
