import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const resultPath = process.env.CUCUMBER_JSON ?? 'artifacts/cucumber-results.json';
const report = JSON.parse(readFileSync(resultPath, 'utf8'));
const routePattern = /router\.(get|post|patch|put|delete)\s*\(\s*['\"]([^'\"]+)['\"]/g;
const sourceRoot = join(process.cwd(), 'backend/src');
const requiredRoutes = new Set();

const controllerFiles = [];
const visit = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) visit(fullPath);
    else if (entry.isFile() && entry.name.endsWith('.controller.ts')) controllerFiles.push(fullPath);
  }
};
visit(sourceRoot);

for (const file of controllerFiles) {
  const source = readFileSync(file, 'utf8');
  let match;
  while ((match = routePattern.exec(source))) {
    requiredRoutes.add(`${match[1].toUpperCase()} ${match[2]}`);
  }
}

const scenarios = report.flatMap((feature) =>
  (feature.elements ?? []).filter((element) => element.type === 'scenario'),
);
const passed = scenarios.filter((scenario) =>
  (scenario.steps ?? []).every((step) => step.result?.status === 'passed'),
);
const coveredRoutes = new Set();
for (const scenario of passed) {
  for (const step of scenario.steps ?? []) {
    const match = String(step.name ?? '').match(
      /^I exercise controller endpoint \"((?:GET|POST|PATCH|PUT|DELETE) .+)\"$/,
    );
    if (match) coveredRoutes.add(match[1]);
  }
}

const missing = [...requiredRoutes].filter((route) => !coveredRoutes.has(route));
const unknown = [...coveredRoutes].filter((route) => !requiredRoutes.has(route));
const failed = scenarios.filter((scenario) =>
  (scenario.steps ?? []).some((step) =>
    ['failed', 'undefined', 'ambiguous', 'pending'].includes(step.result?.status),
  ),
);

console.log(`Backend controller routes: ${coveredRoutes.size}/${requiredRoutes.size} exercised`);
console.log(`Controller endpoint coverage: ${requiredRoutes.size === 0 ? '0.00' : ((coveredRoutes.size / requiredRoutes.size) * 100).toFixed(2)}%`);

if (missing.length) console.error(`Missing controller routes: ${missing.join(' | ')}`);
if (unknown.length) console.error(`Unknown controller routes in features: ${unknown.join(' | ')}`);
if (failed.length) console.error(`Failed Cucumber scenarios: ${failed.map((scenario) => scenario.name).join(' | ')}`);

if (missing.length || unknown.length || failed.length || coveredRoutes.size !== requiredRoutes.size) {
  process.exitCode = 1;
}
