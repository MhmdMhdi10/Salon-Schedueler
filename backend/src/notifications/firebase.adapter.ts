import { readFileSync } from 'node:fs';
import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import type { PushPayload, PushProvider, PushDeliveryResult } from './push-provider.interface.js';
import { logDeliveryOutcome, toErrorMessage } from './provider-http.js';

/** Firebase Admin credentials supplied by server-only environment variables. */
export interface FirebaseAdminConfig {
  projectId?: string;
  clientEmail?: string;
  privateKey?: string;
  credentialsPath?: string;
  clickAction?: string;
}

/** True when Firebase Admin can be initialized without guessing credentials. */
export function hasFirebaseAdminCredentials(config: FirebaseAdminConfig): boolean {
  return Boolean(
    config.credentialsPath || (config.projectId && config.clientEmail && config.privateKey),
  );
}

function readServiceAccount(path: string): ServiceAccount {
  return JSON.parse(readFileSync(path, 'utf8')) as ServiceAccount;
}

function createFirebaseAdminApp(config: FirebaseAdminConfig): App {
  const name = 'ara-firebase-messaging';
  const existing = getApps().find((app) => app.name === name);
  if (existing) return existing;

  const credential = config.credentialsPath
    ? cert(readServiceAccount(config.credentialsPath))
    : config.projectId && config.clientEmail && config.privateKey
      ? cert({
          projectId: config.projectId,
          clientEmail: config.clientEmail,
          privateKey: config.privateKey,
        })
      : applicationDefault();

  return initializeApp(
    {
      credential,
      projectId: config.projectId,
    },
    name,
  );
}

/** Firebase Cloud Messaging adapter for browser registration tokens. */
export class FirebaseCloudMessagingAdapter implements PushProvider {
  private readonly app: App;
  private readonly clickAction: string;

  constructor(config: FirebaseAdminConfig = {}) {
    this.app = createFirebaseAdminApp(config);
    this.clickAction = config.clickAction ?? '/account';
  }

  async send(token: string, payload: PushPayload): Promise<PushDeliveryResult> {
    try {
      const messageId = await getMessaging(this.app).send({
        token,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: { link: this.clickAction },
        webpush: {
          notification: {
            title: payload.title,
            body: payload.body,
            dir: 'rtl',
          },
        },
      });

      logDeliveryOutcome({
        provider: 'firebase',
        target: token,
        ok: true,
        providerId: messageId,
      });
      return { ok: true, providerId: messageId };
    } catch (error) {
      const message = toErrorMessage(error);
      logDeliveryOutcome({ provider: 'firebase', target: token, ok: false, error: message });
      return { ok: false, error: message };
    }
  }
}
