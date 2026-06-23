/**
 * Shared HTTP helpers for the real notification provider adapters
 * (Kavenegar, SMS.ir, Pushe, Najva).
 *
 * Centralizes the two cross-cutting concerns every SMS/push adapter needs:
 *  - a bounded request (a timeout enforced with `AbortController`), and
 *  - a structured, single-line log of the delivery outcome
 *
 * so that provider failures are observable in production (Requirement 5.3).
 */

/** Default request timeout for provider calls, in milliseconds (~10s). */
export const DEFAULT_PROVIDER_TIMEOUT_MS = 10_000;

/**
 * Perform a `fetch` bounded by a timeout. When the timeout elapses the request
 * is aborted, which rejects the returned promise (an `AbortError`). The calling
 * adapter converts that rejection into a structured failure result rather than
 * letting it propagate (Requirement 5.3).
 *
 * @param url - The request URL.
 * @param init - Standard `fetch` init (method, headers, body, ...).
 * @param timeoutMs - Abort the request after this many milliseconds.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Structured outcome of a single provider delivery attempt. */
export interface DeliveryOutcomeLog {
  /** Provider name, e.g. `kavenegar`, `smsir`, `pushe`, `najva`. */
  provider: string;
  /** Delivery target — the destination phone number or device token. */
  target: string;
  /** Whether the provider accepted the message. */
  ok: boolean;
  /** Provider-assigned message/track id on success. */
  providerId?: string;
  /** Human-readable error on failure. */
  error?: string;
}

/**
 * Emit a structured, single-line log of a delivery outcome so successes and
 * (more importantly) failures are observable (Requirement 5.3). Successes are
 * logged at `console.log`; failures at `console.error`.
 */
export function logDeliveryOutcome(outcome: DeliveryOutcomeLog): void {
  const record = {
    provider: outcome.provider,
    target: outcome.target,
    ok: outcome.ok,
    ...(outcome.providerId !== undefined ? { providerId: outcome.providerId } : {}),
    ...(outcome.error !== undefined ? { error: outcome.error } : {}),
  };
  // eslint-disable-next-line no-console
  (outcome.ok ? console.log : console.error)(`[notify] ${JSON.stringify(record)}`);
}

/**
 * Normalize a thrown value (network error, abort, etc.) into an error message.
 */
export function toErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.name === 'AbortError' ? 'request timed out' : err.message;
  }
  return String(err);
}
