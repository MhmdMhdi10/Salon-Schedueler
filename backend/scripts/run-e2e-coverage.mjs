import { mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const forwardedArgs = process.argv.slice(2);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(`[backend e2e] ${command} failed to start: ${result.error.message}`);
    return 1;
  }

  return result.status ?? 1;
}

// Build backend before instrumentation so coverage is also a compile gate.
// Docker's bind-mounted dist can contain root-owned files, so compile into a
// temporary writable output directory and keep the E2E run source-based.
const buildDir = mkdtempSync(join(tmpdir(), 'salon-backend-e2e-build-'));
const buildStatus = run(npmCommand, [
  'run',
  'build',
  '--',
  '--outDir',
  buildDir,
  '--tsBuildInfoFile',
  join(buildDir, 'tsconfig.tsbuildinfo'),
]);
rmSync(buildDir, { recursive: true, force: true });
if (buildStatus !== 0) process.exit(buildStatus);

const cucumberArgs = ['run', 'e2e:cucumber:coverage:run'];
if (forwardedArgs.length > 0) cucumberArgs.push('--', ...forwardedArgs);

const statuses = [run(npmCommand, cucumberArgs)];

// Keep diagnostics complete even when Cucumber fails. JSON, route, DTO, and
// structure checks remain visible in the same command output.
statuses.push(run(process.execPath, ['scripts/check-cucumber-json.mjs']));
statuses.push(run(npmCommand, ['run', 'e2e:cucumber:structure']));
statuses.push(run(process.execPath, ['scripts/check-controller-coverage.mjs']));
statuses.push(run(process.execPath, ['scripts/check-dto-coverage.mjs']));

process.exitCode = statuses.find((status) => status !== 0) ?? 0;
