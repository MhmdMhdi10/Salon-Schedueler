/**
 * Backend entry point.
 *
 * Builds the application via the Composition_Root and starts the HTTP server on
 * the configured PORT (default 3000). The health endpoint is available at
 * GET /healthz (Requirement 2.1).
 */
import { createApp } from './composition-root.js';

function bootstrap(): void {
  const { app, config, prisma } = createApp();

  const server = app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Salon Booking System API listening on port ${config.port}`);
  });

  const shutdown = (signal: string): void => {
    // eslint-disable-next-line no-console
    console.log(`Received ${signal}, shutting down...`);
    server.close(() => {
      void prisma.$disconnect().finally(() => process.exit(0));
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap();
