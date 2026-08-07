/**
 * Backend entry point.
 *
 * Builds the application via the Composition_Root and starts the HTTP server on
 * the configured PORT (default 3000). The health endpoint is available at
 * GET /healthz (Requirement 2.1). The inbox WebSocket endpoint is mounted on the
 * same HTTP server's 'upgrade' event at /ws/inbox (Requirements 12.x).
 */
import { createServer } from 'node:http';
import type { Socket } from 'node:net';
import { WebSocketServer, type WebSocket as WsSocket } from 'ws';
import { createApp } from './composition-root.js';
import { makeWsInboxHandle } from './http/routes/inbox.routes.js';

function bootstrap(): void {
  const { app, config, prisma, services } = createApp();

  // Single HTTP server used for both REST + WS upgrade hand-off.
  const server = createServer(app);

  // Inbox WS endpoint: JWT-authenticated per-salon rooms.
  const wsInbox = makeWsInboxHandle(services, config.jwtAccessSecret);
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const { url } = req;
    if (!url || !url.startsWith(wsInbox.path)) {
      (socket as { destroy: () => void }).destroy();
      return;
    }
    wss.handleUpgrade(req, socket as Socket, head, (ws) => {
        wsInbox.handleUpgrade(
          ws as WsSocket,
          {
            subprotocol: Array.isArray(req.headers['sec-websocket-protocol'])
              ? String(req.headers['sec-websocket-protocol'][0] ?? '')
              : req.headers['sec-websocket-protocol'] ?? undefined,
            url,
          },
          () => {
            try {
              (ws as WsSocket & { destroy?: () => void }).destroy?.();
            } catch {}
          },
        );
        wss.emit('connection', ws, req);
      },
    );
  });

  // Heartbeat to drop dead sockets every 30s.
  const sweep = setInterval(() => services.wsInboxHub.sweep(), 30_000);
  sweep.unref?.();

  // Background booking maintenance. Reminder delivery is idempotent at the
  // notification-log level and its SMS leg uses RabbitMQ when configured;
  // expired deposit holds are released on the same cadence so slots do not stay
  // blocked after a customer abandons checkout.
  const backgroundTick = setInterval(() => {
    void Promise.allSettled([
      services.notificationService.dispatchReminders(
        new Date(),
        config.reminderLeadTimeMinutes,
      ),
      services.cancellationFlow.releaseExpiredHoldsAndNotify(new Date()),
    ]).then((results) => {
      for (const result of results) {
        if (result.status === 'rejected') {
          // eslint-disable-next-line no-console
          console.error('[background] maintenance task failed:', result.reason);
        }
      }
    });
  }, config.reminderIntervalMs);
  backgroundTick.unref?.();

  server.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Salon Booking System API listening on port ${config.port}`);
  });

  const shutdown = (signal: string): void => {
    // eslint-disable-next-line no-console
    console.log(`Received ${signal}, shutting down...`);
    clearInterval(sweep);
    clearInterval(backgroundTick);
    wss.close();
    server.close(() => {
      void prisma.$disconnect().finally(() => process.exit(0));
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap();
