/**
 * Pure flow logic for the mobile authentication screen.
 *
 * Extracted from the React Native component so the phone -> OTP -> verify ->
 * store-tokens flow can be tested without a device runtime. Each function
 * wraps the API client and returns a structured result instead of throwing.
 *
 * Requirement: 7.4, 7.5 (orig R1)
 */
import { authApi, setAccessToken, ApiError } from '../api/client';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export type RequestOtpResult =
  | { ok: true }
  | { ok: false; error: string; code?: string };
export type VerifyOtpResult =
  | { ok: true; tokens: AuthTokens }
  | { ok: false; error: string; code?: string };

/** Persist tokens (e.g. to secure storage). Abstracted so the flow stays testable. */
export type PersistTokens = (tokens: AuthTokens) => void | Promise<void>;

function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = (err as { message: unknown }).message;
    if (typeof msg === 'string' && msg.length > 0) return msg;
  }
  return 'خطای ناشناخته';
}

/**
 * Extract a stable error code so the screen can show a localized message.
 * - `ApiError` carries the backend's error `code` (e.g. OTP_EXPIRED).
 * - A thrown `TypeError` from fetch (no response) is a network failure.
 */
function errorCode(err: unknown): string | undefined {
  if (err instanceof ApiError) return err.code;
  // fetch() rejects with a TypeError when the request never reaches the server
  // (offline, DNS, connection refused, CORS-blocked). Surface as NETWORK.
  if (err instanceof TypeError) return 'NETWORK';
  return undefined;
}

/** Step 1: request an OTP for the given phone number. Never throws. */
export async function requestOtp(phone: string): Promise<RequestOtpResult> {
  try {
    await authApi.requestOtp(phone);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err), code: errorCode(err) };
  }
}

/**
 * Step 2: verify the OTP, store the access token in the API client, and
 * optionally persist the tokens. Never throws.
 */
export async function verifyOtp(
  phone: string,
  code: string,
  persist?: PersistTokens
): Promise<VerifyOtpResult> {
  try {
    const tokens = await authApi.verifyOtp(phone, code);
    setAccessToken(tokens.accessToken);
    if (persist) {
      await persist(tokens);
    }
    return { ok: true, tokens };
  } catch (err) {
    return { ok: false, error: errorMessage(err), code: errorCode(err) };
  }
}
