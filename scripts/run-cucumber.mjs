import { mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

mkdirSync('artifacts', { recursive: true });

const require = createRequire(import.meta.url);
const cucumberBin = join(dirname(require.resolve('@cucumber/cucumber')), '..', 'bin', 'cucumber-js');
const child = spawn(process.execPath, [cucumberBin, '--config', 'cucumber.js', ...process.argv.slice(2)], {
  env: { ...process.env },
  stdio: 'inherit',
});

child.on('error', (error) => {
  console.error(`[cucumber] failed to start: ${error.message}`);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`[cucumber] terminated by ${signal}`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
