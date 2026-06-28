import type {
  Channel,
  ChannelModel,
  ConfirmChannel,
  ConsumeMessage,
} from 'amqplib';
import type { SmsProvider } from '../auth/sms-provider.interface.js';

/**
 * Reliable SMS delivery over RabbitMQ.
 *
 * Topology (all durable):
 *   exchange  sms       (direct)            ← producers publish key `send`
 *   queue     sms.send  (durable)           ← the work queue; DLX → sms.dlx/dead
 *   queue     sms.retry (durable, TTL)      ← failed jobs park here; on TTL they
 *                                             dead-letter back to sms → sms.send
 *   exchange  sms.dlx   (direct)
 *   queue     sms.dead  (durable)           ← exhausted jobs for ops/inspection
 *
 * Guarantees:
 *  - Publisher confirms + `persistent` messages → a publish only "succeeds" once
 *    the broker has durably accepted the message (survives broker restart).
 *  - Manual ack + `prefetch(1)` on the consumer → a message is removed only
 *    after the SMS provider confirms delivery.
 *  - Transient failures are retried with a backoff (via the TTL retry queue),
 *    up to `maxAttempts`; after that the message is dead-lettered (never lost).
 *
 * `amqplib` is imported dynamically so this module (and anything importing the
 * Composition_Root) never requires the dependency unless the queue is actually
 * used (i.e. `RABBITMQ_URL` is configured / the worker runs).
 */

export const SMS_EXCHANGE = 'sms';
export const SMS_ROUTING_KEY = 'send';
export const SMS_QUEUE = 'sms.send';
export const SMS_RETRY_QUEUE = 'sms.retry';
export const SMS_DLX = 'sms.dlx';
export const SMS_DEAD_ROUTING_KEY = 'dead';
export const SMS_DEAD_QUEUE = 'sms.dead';

/** Header carrying the (zero-based) number of delivery attempts already made. */
export const ATTEMPTS_HEADER = 'x-attempts';

/** A single SMS delivery job carried on the queue. */
export interface SmsJob {
  /** Destination phone number. */
  to: string;
  /** Message body. */
  message: string;
}

/** Minimal logger shape (console satisfies it). */
export interface QueueLogger {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

/** Options controlling retry/backoff behavior. */
export interface SmsTopologyOptions {
  /** Total attempts before dead-lettering. Default 5. */
  maxAttempts?: number;
  /** Backoff before a retry, in ms (the retry queue's TTL). Default 30000. */
  retryDelayMs?: number;
}

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_RETRY_DELAY_MS = 30000;

/**
 * Dynamically load amqplib and open a connection, tolerating the CommonJS/ESM
 * interop shapes (`connect` may live on the namespace or on `.default`).
 */
async function amqpConnect(url: string): Promise<ChannelModel> {
  const mod = (await import('amqplib')) as unknown as {
    connect?: (url: string) => Promise<ChannelModel>;
    default?: { connect: (url: string) => Promise<ChannelModel> };
  };
  const connect = mod.connect ?? mod.default?.connect;
  if (!connect) {
    throw new Error('amqplib: connect() not found');
  }
  return connect(url);
}

/**
 * Idempotently assert the SMS topology on a channel. Safe to call on every
 * (re)connect; RabbitMQ no-ops when the entities already exist with matching
 * arguments.
 */
export async function assertSmsTopology(
  channel: Channel | ConfirmChannel,
  options: SmsTopologyOptions = {},
): Promise<void> {
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  await channel.assertExchange(SMS_EXCHANGE, 'direct', { durable: true });
  await channel.assertExchange(SMS_DLX, 'direct', { durable: true });

  // The work queue dead-letters (on nack-without-requeue) to the DLX → dead queue.
  await channel.assertQueue(SMS_QUEUE, {
    durable: true,
    deadLetterExchange: SMS_DLX,
    deadLetterRoutingKey: SMS_DEAD_ROUTING_KEY,
  });
  await channel.bindQueue(SMS_QUEUE, SMS_EXCHANGE, SMS_ROUTING_KEY);

  // The retry queue holds messages for `retryDelayMs`, then dead-letters them
  // back to the work exchange/queue for another attempt (backoff without a
  // busy-loop). It has no consumer.
  await channel.assertQueue(SMS_RETRY_QUEUE, {
    durable: true,
    deadLetterExchange: SMS_EXCHANGE,
    deadLetterRoutingKey: SMS_ROUTING_KEY,
    messageTtl: retryDelayMs,
  });

  // The dead-letter parking queue.
  await channel.assertQueue(SMS_DEAD_QUEUE, { durable: true });
  await channel.bindQueue(SMS_DEAD_QUEUE, SMS_DLX, SMS_DEAD_ROUTING_KEY);
}

/** Read the attempts header off a consumed message (defaults to 0). */
function readAttempts(msg: ConsumeMessage): number {
  const raw = msg.properties.headers?.[ATTEMPTS_HEADER];
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Publisher for SMS jobs. Lazily connects (and reconnects) a confirm channel and
 * publishes durable, persistent messages. `publish` resolves `true` only once
 * the broker has confirmed the message; on any failure it resolves `false` so
 * the caller can fall back (never silently drop an SMS).
 */
export class RabbitMqSmsPublisher {
  private readonly url: string;
  private readonly options: SmsTopologyOptions;
  private readonly logger: QueueLogger;
  private connection: ChannelModel | null = null;
  private channelPromise: Promise<ConfirmChannel> | null = null;

  constructor(url: string, options: SmsTopologyOptions = {}, logger: QueueLogger = console) {
    this.url = url;
    this.options = options;
    this.logger = logger;
  }

  private async getChannel(): Promise<ConfirmChannel> {
    if (this.channelPromise) return this.channelPromise;
    this.channelPromise = (async () => {
      const connection = await amqpConnect(this.url);
      this.connection = connection;
      const reset = () => {
        this.channelPromise = null;
        this.connection = null;
      };
      connection.on('error', () => {});
      connection.on('close', reset);
      const channel = await connection.createConfirmChannel();
      channel.on('error', () => {});
      channel.on('close', reset);
      await assertSmsTopology(channel, this.options);
      return channel;
    })();
    try {
      return await this.channelPromise;
    } catch (err) {
      this.channelPromise = null;
      throw err;
    }
  }

  /**
   * Publish an SMS job. Resolves `true` when the broker confirms durable
   * acceptance; `false` on any error (so the caller can deliver directly).
   */
  async publish(job: SmsJob): Promise<boolean> {
    try {
      const channel = await this.getChannel();
      const content = Buffer.from(JSON.stringify(job));
      await new Promise<void>((resolve, reject) => {
        channel.publish(
          SMS_EXCHANGE,
          SMS_ROUTING_KEY,
          content,
          { persistent: true, contentType: 'application/json', headers: { [ATTEMPTS_HEADER]: 0 } },
          (err) => (err ? reject(err) : resolve()),
        );
      });
      return true;
    } catch (err) {
      this.logger.error('[sms-queue] publish failed; falling back to direct send', err);
      this.channelPromise = null;
      return false;
    }
  }

  /** Close the connection (best-effort), for graceful shutdown. */
  async close(): Promise<void> {
    try {
      await this.connection?.close();
    } catch {
      // ignore
    } finally {
      this.connection = null;
      this.channelPromise = null;
    }
  }
}

/**
 * Run the SMS consumer on an open channel: deliver each job via `smsProvider`
 * with manual ack; retry transient failures with backoff up to `maxAttempts`,
 * then dead-letter. Returns the consumerTag.
 */
export async function consumeSmsQueue(
  channel: Channel,
  smsProvider: SmsProvider,
  options: SmsTopologyOptions = {},
  logger: QueueLogger = console,
): Promise<string> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  await assertSmsTopology(channel, options);
  await channel.prefetch(1);

  const { consumerTag } = await channel.consume(
    SMS_QUEUE,
    (msg) => {
      if (!msg) return; // consumer cancelled
      void handleSmsMessage(channel, msg, smsProvider, maxAttempts, logger);
    },
    { noAck: false },
  );
  return consumerTag;
}

/** Handle a single consumed SMS message (deliver → ack | retry | dead-letter). */
async function handleSmsMessage(
  channel: Channel,
  msg: ConsumeMessage,
  smsProvider: SmsProvider,
  maxAttempts: number,
  logger: QueueLogger,
): Promise<void> {
  const priorAttempts = readAttempts(msg);
  const attemptNo = priorAttempts + 1;

  let job: SmsJob | null = null;
  try {
    job = JSON.parse(msg.content.toString()) as SmsJob;
  } catch {
    // Unparseable payload can never succeed — dead-letter immediately.
    logger.error('[sms-queue] dropping unparseable message → DLQ');
    channel.nack(msg, false, false);
    return;
  }

  try {
    const result = await smsProvider.send(job.to, job.message);
    if (result.ok) {
      channel.ack(msg);
      return;
    }
    throw new Error(result.error);
  } catch (err) {
    if (attemptNo >= maxAttempts) {
      logger.error(
        `[sms-queue] SMS to ${job.to} failed after ${attemptNo} attempts → DLQ`,
        err instanceof Error ? err.message : err,
      );
      // nack without requeue → dead-letters via the work queue's DLX.
      channel.nack(msg, false, false);
      return;
    }
    // Transient failure: park in the retry queue (TTL backoff) with an
    // incremented attempt count, then ack the original (we've taken ownership).
    logger.log(
      `[sms-queue] SMS to ${job.to} failed (attempt ${attemptNo}/${maxAttempts}); scheduling retry`,
    );
    channel.sendToQueue(SMS_RETRY_QUEUE, msg.content, {
      persistent: true,
      contentType: 'application/json',
      headers: { ...(msg.properties.headers ?? {}), [ATTEMPTS_HEADER]: attemptNo },
    });
    channel.ack(msg);
  }
}

/**
 * Connect to RabbitMQ and run the SMS consumer, reconnecting on connection loss.
 * Returns a stop() that cancels the consumer and closes the connection.
 */
export async function startSmsWorker(
  url: string,
  smsProvider: SmsProvider,
  options: SmsTopologyOptions = {},
  logger: QueueLogger = console,
): Promise<() => Promise<void>> {
  let stopped = false;
  let connection: ChannelModel | null = null;

  const run = async (): Promise<void> => {
    if (stopped) return;
    try {
      connection = await amqpConnect(url);
      connection.on('error', (err: unknown) => {
        logger.error('[sms-worker] connection error', err);
      });
      connection.on('close', () => {
        if (stopped) return;
        logger.error('[sms-worker] connection closed; reconnecting in 5s');
        connection = null;
        setTimeout(() => void run(), 5000);
      });
      const channel = await connection.createChannel();
      await consumeSmsQueue(channel, smsProvider, options, logger);
      logger.log('[sms-worker] consuming', SMS_QUEUE);
    } catch (err) {
      logger.error('[sms-worker] failed to start; retrying in 5s', err);
      connection = null;
      if (!stopped) setTimeout(() => void run(), 5000);
    }
  };

  await run();

  return async () => {
    stopped = true;
    try {
      await connection?.close();
    } catch {
      // ignore
    }
  };
}
