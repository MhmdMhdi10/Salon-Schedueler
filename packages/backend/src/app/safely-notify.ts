/**
 * A minimal logger sink. `console` satisfies this, and tests can supply a spy.
 */
export interface Logger {
  error(...args: unknown[]): void;
}

/**
 * Run a side-effecting notification (`fn`) so that a delivery failure is logged
 * but never propagates to the caller.
 *
 * This is the single rule the application layer needs around notifications: a
 * confirmation SMS or a waitlist notification that fails must NOT roll back the
 * confirmed booking or the resource release (Requirement 4.4, consistent with the
 * original R12.4 no-fallback logging rule). The error is swallowed after logging.
 *
 * @param fn - The notification side effect to attempt.
 * @param logger - Where to record failures (defaults to `console`).
 */
export async function safelyNotify(
  fn: () => Promise<unknown>,
  logger: Logger = console,
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    logger.error('[notify] delivery failed (swallowed):', err);
  }
}
