import type { CancellationFlow } from './app/cancellation-flow.js';
import type { NotificationService } from './notifications/notification.service.js';
import { buildContainer } from './composition-root.js';

export interface NotificationCronOptions {
  intervalMs: number;
  reminderLeadTimeMinutes: number;
  logger?: Pick<Console, 'error'>;
}

/** One idempotent maintenance pass used by both API fallback and cron worker. */
export async function runNotificationMaintenance(
  notificationService: NotificationService,
  cancellationFlow: CancellationFlow,
  reminderLeadTimeMinutes: number,
  logger: Pick<Console, 'error'> = console,
): Promise<void> {
  const results = await Promise.allSettled([
    notificationService.dispatchReminders(new Date(), reminderLeadTimeMinutes),
    cancellationFlow.releaseExpiredHoldsAndNotify(new Date()),
  ]);
  for (const result of results) {
    if (result.status === 'rejected') logger.error('[notification-cron] maintenance failed:', result.reason);
  }
}

/** Start a dependency-free cron loop; DB notification logs make it restart-safe. */
export function startNotificationCron(
  notificationService: NotificationService,
  cancellationFlow: CancellationFlow,
  options: NotificationCronOptions,
): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runNotificationMaintenance(
        notificationService,
        cancellationFlow,
        options.reminderLeadTimeMinutes,
        options.logger,
      );
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), options.intervalMs);
  return () => clearInterval(timer);
}

// Standalone Docker/system-process entry point. The API process keeps a local
// fallback unless NOTIFICATION_CRON_EXTERNAL=true, so bare-metal deployments
// remain functional while compose can run exactly one dedicated scheduler.
if (process.argv[1]?.endsWith('/notification-cron.js')) {
  const { services, config, prisma } = buildContainer();
  const stop = startNotificationCron(services.notificationService, services.cancellationFlow, {
    intervalMs: config.reminderIntervalMs,
    reminderLeadTimeMinutes: config.reminderLeadTimeMinutes,
  });
  const shutdown = () => {
    stop();
    void prisma.$disconnect().finally(() => process.exit(0));
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
