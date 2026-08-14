import { mkdirSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

mkdirSync('artifacts', { recursive: true });

const require = createRequire(import.meta.url);
const cucumberBin = join(
  dirname(require.resolve('@cucumber/cucumber')),
  '..',
  'bin',
  'cucumber-js',
);

const env = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  E2E_QUIET_LOGS: process.env.E2E_QUIET_LOGS ?? 'true',
  TS_NODE_EXPERIMENTAL_RESOLVER: process.env.TS_NODE_EXPERIMENTAL_RESOLVER ?? 'true',
  DEV_OTP_AUTO_FILL: process.env.DEV_OTP_AUTO_FILL ?? 'true',
  E2E_REGISTRATION_IP_LIMIT: process.env.E2E_REGISTRATION_IP_LIMIT ?? '500',
  E2E_OTP_REQUEST_IP_LIMIT: process.env.E2E_OTP_REQUEST_IP_LIMIT ?? '1000',
  E2E_OTP_REQUEST_PHONE_LIMIT: process.env.E2E_OTP_REQUEST_PHONE_LIMIT ?? '500',
  E2E_OTP_VERIFY_IP_LIMIT: process.env.E2E_OTP_VERIFY_IP_LIMIT ?? '1000',
  E2E_OTP_VERIFY_PHONE_LIMIT: process.env.E2E_OTP_VERIFY_PHONE_LIMIT ?? '500',
  E2E_BOOKING_IP_LIMIT: process.env.E2E_BOOKING_IP_LIMIT ?? '200',
  E2E_BOOKING_CUSTOMER_LIMIT: process.env.E2E_BOOKING_CUSTOMER_LIMIT ?? '100',
  E2E_APPOINTMENT_MUTATION_LIMIT: process.env.E2E_APPOINTMENT_MUTATION_LIMIT ?? '200',
  E2E_AUTH_API_LIMIT: process.env.E2E_AUTH_API_LIMIT ?? '1000',
};

function dockerPostgresPort() {
  try {
    const projectRoot = join(process.cwd(), '..');
    const output = execFileSync('docker', ['compose', 'port', 'postgres', '5432'], {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    });
    return output.trim().match(/:(\d+)$/)?.[1];
  } catch {
    return undefined;
  }
}

if (!env.DATABASE_URL) {
  const port = env.E2E_POSTGRES_PORT ?? env.POSTGRES_HOST_PORT ?? dockerPostgresPort() ?? '5432';
  env.DATABASE_URL = `postgresql://salon:salon@127.0.0.1:${port}/salon_dev?schema=public`;
}

const child = spawn(
  process.execPath,
  [cucumberBin, '--config', 'features/cucumber.config.js', ...process.argv.slice(2)],
  { env, stdio: 'inherit' },
);

child.on('error', (error) => {
  console.error(`[backend e2e] failed to start: ${error.message}`);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`[backend e2e] terminated by ${signal}`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
