/**
 * Application configuration.
 *
 * The Composition_Root reads configuration from environment variables
 * (Requirement 3.3). For missing development secrets, safe documented defaults
 * are used; but if NODE_ENV === 'production' and a required secret is missing,
 * loading fails fast with a descriptive error (Requirement 3.5).
 */

/** Which payment gateway adapter to use. */
export type PaymentGatewayName = 'zarinpal' | 'idpay';

/**
 * Fully-resolved application configuration consumed by the Composition_Root.
 */
export interface AppConfig {
  /** PostgreSQL connection string (Prisma). */
  databaseUrl: string;
  /** Secret used to sign/verify JWT access tokens. */
  jwtAccessSecret: string;
  /** Secret used to sign/verify JWT refresh tokens. */
  jwtRefreshSecret: string;
  /** Selected payment gateway. Defaults to 'zarinpal'. */
  paymentGateway: PaymentGatewayName;
  /** Zarinpal merchant id (optional in dev). */
  zarinpalMerchantId?: string;
  /** IDPay API key (optional in dev). */
  idpayApiKey?: string;
  /** Base URL the payment gateway calls back to. */
  paymentCallbackBaseUrl: string;
  /** Kavenegar SMS API key (optional — dev/log adapter used when absent). */
  kavenegarApiKey?: string;
  /** Kavenegar API base URL override (optional; sensible default otherwise). */
  kavenegarBaseUrl?: string;
  /** Kavenegar sender line (optional; account default used when absent). */
  kavenegarSender?: string;
  /** SMS.ir API key (optional). */
  smsirApiKey?: string;
  /** SMS.ir API base URL override (optional). */
  smsirBaseUrl?: string;
  /** SMS.ir sender line number (optional). */
  smsirLineNumber?: string;
  /** Pushe push API key (optional). */
  pusheApiKey?: string;
  /** Pushe API base URL override (optional). */
  pusheBaseUrl?: string;
  /** Pushe application id (optional). */
  pusheAppId?: string;
  /** Najva push API key (optional). */
  najvaApiKey?: string;
  /** Najva API base URL override (optional). */
  najvaBaseUrl?: string;
  /** HTTP port the server listens on. Defaults to 3000. */
  port: number;
  /** Node environment. */
  nodeEnv: string;
}

/** Documented safe development defaults (never used in production). */
const DEV_DEFAULTS = {
  databaseUrl: 'postgresql://localhost:5432/salon_dev?schema=public',
  jwtAccessSecret: 'dev-access-secret',
  jwtRefreshSecret: 'dev-refresh-secret',
  paymentCallbackBaseUrl: 'http://localhost:3000',
} as const;

/** Env var names that must be present in production. */
const REQUIRED_IN_PRODUCTION: { key: string; label: string }[] = [
  { key: 'DATABASE_URL', label: 'DATABASE_URL' },
  { key: 'JWT_ACCESS_SECRET', label: 'JWT_ACCESS_SECRET' },
  { key: 'JWT_REFRESH_SECRET', label: 'JWT_REFRESH_SECRET' },
  { key: 'PAYMENT_CALLBACK_BASE_URL', label: 'PAYMENT_CALLBACK_BASE_URL' },
];

/**
 * Read and validate configuration from an environment map.
 *
 * @param env - The environment source (defaults to process.env).
 * @returns A fully-resolved AppConfig.
 * @throws Error in production when a required secret is missing (fail fast).
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV ?? 'development';
  const isProduction = nodeEnv === 'production';

  if (isProduction) {
    const missing = REQUIRED_IN_PRODUCTION.filter(({ key }) => !env[key]).map(
      ({ label }) => label,
    );
    if (missing.length > 0) {
      throw new Error(
        `Missing required production configuration: ${missing.join(', ')}. ` +
        `Set these environment variables before starting the server in production.`,
      );
    }
  }

  const paymentGateway: PaymentGatewayName =
    env.PAYMENT_GATEWAY === 'idpay' ? 'idpay' : 'zarinpal';

  return {
    databaseUrl: env.DATABASE_URL ?? DEV_DEFAULTS.databaseUrl,
    jwtAccessSecret: env.JWT_ACCESS_SECRET ?? DEV_DEFAULTS.jwtAccessSecret,
    jwtRefreshSecret: env.JWT_REFRESH_SECRET ?? DEV_DEFAULTS.jwtRefreshSecret,
    paymentGateway,
    zarinpalMerchantId: env.ZARINPAL_MERCHANT_ID,
    idpayApiKey: env.IDPAY_API_KEY,
    paymentCallbackBaseUrl:
      env.PAYMENT_CALLBACK_BASE_URL ?? DEV_DEFAULTS.paymentCallbackBaseUrl,
    kavenegarApiKey: env.KAVENEGAR_API_KEY,
    kavenegarBaseUrl: env.KAVENEGAR_BASE_URL,
    kavenegarSender: env.KAVENEGAR_SENDER,
    smsirApiKey: env.SMSIR_API_KEY,
    smsirBaseUrl: env.SMSIR_BASE_URL,
    smsirLineNumber: env.SMSIR_LINE_NUMBER,
    pusheApiKey: env.PUSHE_API_KEY,
    pusheBaseUrl: env.PUSHE_BASE_URL,
    pusheAppId: env.PUSHE_APP_ID,
    najvaApiKey: env.NAJVA_API_KEY,
    najvaBaseUrl: env.NAJVA_BASE_URL,
    port: env.PORT ? Number(env.PORT) : 3000,
    nodeEnv,
  };
}
