/**
 * Re-export the SmsProvider interface from the auth module for use
 * in the notification service. This centralizes the SMS port definition.
 *
 * The canonical interface lives in auth/sms-provider.interface.ts and is
 * re-exported here for convenience when wiring the Notification_Service.
 */
export type {
  SmsProvider,
  SmsTemplateProvider,
  SmsDeliveryResult,
} from '../auth/sms-provider.interface';
