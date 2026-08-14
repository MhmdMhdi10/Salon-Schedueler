/**
 * Cucumber runs exercise expected 500/error branches and local provider fallbacks.
 * Keep those runs readable without changing production observability.
 */
export function isE2EQuietLogs(): boolean {
  return process.env.E2E_QUIET_LOGS === 'true';
}
