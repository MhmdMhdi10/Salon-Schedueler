/**
 * Approved Melli Payamak shared-template ids used by fixed SMS notifications.
 *
 * The order of values passed to `sendTemplate` must match the positional
 * placeholders in the corresponding template (`args[0]` -> `{0}`).
 */
export const MELLI_PAYAMAK_TEMPLATE_BODY_IDS = {
  otp: 523232,
  waitlist: 525119,
  staffReminder: 525118,
  staffCancellation: 525117,
  bookingNotice: 525115,
  customerReminder: 525114,
  customerCancellation: 525113,
  rejection: 525112,
  confirmation: 525111,
} as const;

export type MelliPayamakNotificationTemplate = Exclude<
  keyof typeof MELLI_PAYAMAK_TEMPLATE_BODY_IDS,
  'otp' | 'waitlist'
>;
