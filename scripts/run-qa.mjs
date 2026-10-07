import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const webUrl = process.env.E2E_WEB_BASE_URL ?? process.env.E2E_BASE_URL ?? 'http://localhost:5273';
const apiUrl = process.env.E2E_API_BASE_URL ?? 'http://127.0.0.1:3110';
const env = {
  ...process.env,
  QA_ARTIFACT_DIR: resolve(process.env.QA_ARTIFACT_DIR ?? 'artifacts/qa'),
  E2E_BASE_URL: process.env.E2E_BASE_URL ?? webUrl,
  E2E_WEB_BASE_URL: webUrl,
  E2E_API_BASE_URL: apiUrl,
};

for (const [name, url] of [
  ['backend API', new URL('/healthz', apiUrl)],
  ['web app', new URL('/business/register', webUrl)],
]) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    console.error(`[qa] ${name} is unavailable at ${url}`);
    console.error('[qa] Start the local Docker stack with: docker compose up -d --build');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

const suites = [
  ['Workspace unit and property tests', ['test']],
  ['Business API/browser Cucumber journeys', ['run', 'test:e2e:business']],
  ['Backend Cucumber, 100% controller coverage, route and DTO gates', ['run', 'test:e2e:cov']],
  ['Playwright browser matrix', ['run', 'e2e']],
];

for (const [name, args] of suites) {
  console.log(`\n[qa] ${name}`);
  const result = spawnSync(npmCommand, args, {
    cwd: process.cwd(),
    env,
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(`[qa] ${name} failed to start: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[qa] stopped after failure in: ${name}`);
    process.exit(result.status ?? 1);
  }
}

console.log(`\n[qa] All suites passed. Reports: ${env.QA_ARTIFACT_DIR}`);
