import type { ControllerDtoDefinition } from '../../common/dto/index.js';
import { ADMIN_CONTROLLER_DTO_DEFINITIONS } from '../../admin/dto/admin-controller.dto.js';
import { APPOINTMENT_CONTROLLER_DTO_DEFINITIONS } from '../../appointment/dto/appointment-controller.dto.js';
import { AUTH_CONTROLLER_DTO_DEFINITIONS } from '../../auth/dto/auth-controller.dto.js';
import { BOT_CONTROLLER_DTO_DEFINITIONS } from '../../bot/dto/bot-controller.dto.js';
import { CARD_ORDER_CONTROLLER_DTO_DEFINITIONS } from '../../card-order/dto/card-order-controller.dto.js';
import { CUSTOMER_CONTROLLER_DTO_DEFINITIONS } from '../../customer/dto/customer-controller.dto.js';
import { DEVICE_CONTROLLER_DTO_DEFINITIONS } from '../../device/dto/device-controller.dto.js';
import { HEALTH_CONTROLLER_DTO_DEFINITIONS } from '../../health/dto/health-controller.dto.js';
import { INBOX_CONTROLLER_DTO_DEFINITIONS } from '../../inbox/dto/inbox-controller.dto.js';
import { PAYMENT_CONTROLLER_DTO_DEFINITIONS } from '../../payment/dto/payment-controller.dto.js';
import { PLATFORM_ADMIN_CONTROLLER_DTO_DEFINITIONS } from '../../platform-admin/dto/platform-admin-controller.dto.js';
import { QR_CONTROLLER_DTO_DEFINITIONS } from '../../qr/dto/qr-controller.dto.js';
import { REFERRAL_CONTROLLER_DTO_DEFINITIONS } from '../../referral/dto/referral-controller.dto.js';
import { REGISTRATION_CONTROLLER_DTO_DEFINITIONS } from '../../registration/dto/registration-controller.dto.js';
import { SALON_CONTROLLER_DTO_DEFINITIONS } from '../../salon/dto/salon-controller.dto.js';
import { SUBSCRIPTION_CONTROLLER_DTO_DEFINITIONS } from '../../subscription/dto/subscription-controller.dto.js';
import { TRANSACTION_CONTROLLER_DTO_DEFINITIONS } from '../../transaction/dto/transaction-controller.dto.js';
import { WAITLIST_CONTROLLER_DTO_DEFINITIONS } from '../../waitlist/dto/waitlist-controller.dto.js';

/**
 * Composition-root DTO registry.
 *
 * Each entry is authored in its feature's `dto/*-controller.dto.ts` file and
 * only composed here for one middleware registration point. This keeps the
 * V-House controller → DTO ownership visible in the feature tree while still
 * allowing Express to validate every route before its handler runs.
 */
export const CONTROLLER_DTO_DEFINITIONS = [
  ...ADMIN_CONTROLLER_DTO_DEFINITIONS,
  ...APPOINTMENT_CONTROLLER_DTO_DEFINITIONS,
  ...AUTH_CONTROLLER_DTO_DEFINITIONS,
  ...BOT_CONTROLLER_DTO_DEFINITIONS,
  ...CARD_ORDER_CONTROLLER_DTO_DEFINITIONS,
  ...CUSTOMER_CONTROLLER_DTO_DEFINITIONS,
  ...DEVICE_CONTROLLER_DTO_DEFINITIONS,
  ...HEALTH_CONTROLLER_DTO_DEFINITIONS,
  ...INBOX_CONTROLLER_DTO_DEFINITIONS,
  ...PAYMENT_CONTROLLER_DTO_DEFINITIONS,
  ...PLATFORM_ADMIN_CONTROLLER_DTO_DEFINITIONS,
  ...QR_CONTROLLER_DTO_DEFINITIONS,
  ...REFERRAL_CONTROLLER_DTO_DEFINITIONS,
  ...REGISTRATION_CONTROLLER_DTO_DEFINITIONS,
  ...SALON_CONTROLLER_DTO_DEFINITIONS,
  ...SUBSCRIPTION_CONTROLLER_DTO_DEFINITIONS,
  ...TRANSACTION_CONTROLLER_DTO_DEFINITIONS,
  ...WAITLIST_CONTROLLER_DTO_DEFINITIONS,
] as const satisfies readonly ControllerDtoDefinition[];

export const CONTROLLER_DTO_COUNT = CONTROLLER_DTO_DEFINITIONS.length;

/** Unique HTTP signatures; two controllers intentionally share booking-policy GET. */
export const CONTROLLER_DTO_KEYS = new Set(
  CONTROLLER_DTO_DEFINITIONS.map(({ method, path }) => `${method} ${path}`),
);
