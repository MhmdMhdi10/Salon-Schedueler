/**
 * SMS worker entry point.
 *
 * A separate long-running process from the HTTP API. It consumes the durable
 * `sms.send` queue and performs the actual provider delivery (Kavenegar/SMS.ir,
 * or the dev/log provider) with manual ack, backoff retry, and dead-lettering
 * (see `messaging/sms-queue.ts`). Run it with `node dist/sms-worker.js`.
 */
import { loadConfig } from './config.js';
import { selectDeliverySmsProvider } from './composition-root.js';
import { startSmsWorker } from './messaging/sms-queue.js';

async function bootstrap(): Promise<void> {
  const config = loadConfig();

  if (!config.rabbitmqUrl) {
    // Nothing to consume without a broker — exit cleanly rather than crash-loop.
    // eslint-disable-next-line no-console
    console.error('[sms-worker] RABBITMQ_URL is not set; nothing to do. Exiting.');
    process.exit(0);
    return;
  }

  const smsProvider = selectDeliverySmsProvider(config);

  // eslint-disable-next-line no-console
  console.log('[sms-worker] starting; connecting to broker...');
  const stop = await startSmsWorker(
    config.rabbitmqUrl,
    smsProvider,
    {
      maxAttempts: config.smsQueueMaxAttempts,
      retryDelayMs: config.smsQueueRetryDelayMs,
    },
    console,
  );

  const shutdown = (signal: string): void => {
    // eslint-disable-next-line no-console
    console.log(`[sms-worker] received ${signal}, shutting down...`);
    void stop().finally(() => process.exit(0));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

void bootstrap();
