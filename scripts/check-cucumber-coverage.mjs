import { readFile } from 'node:fs/promises';

const requiredFlows = [
  'flow-health',
  'flow-public-auth',
  'flow-registration',
  'flow-fixed-salon',
  'flow-rented-chair',
  'flow-mobile',
  'flow-hybrid',
  'flow-booking-salon',
  'flow-booking-mobile',
  'flow-booking-approval',
  'flow-booking-rejection',
  'flow-booking-deposit',
  'flow-cancellation',
  'flow-rbac',
  'flow-owner-config',
  'flow-customer-account',
  'flow-platform-admin',
  'flow-ui-onboarding',
  'flow-ui-booking',
  'flow-failure-paths',
];

const resultPath = process.env.CUCUMBER_JSON ?? 'artifacts/cucumber-results.json';
const raw = await readFile(resultPath, 'utf8');
const report = JSON.parse(raw);

const scenarios = report.flatMap((feature) =>
  (feature.elements ?? []).filter((element) => element.type === 'scenario'),
);
const passed = scenarios.filter((scenario) =>
  (scenario.steps ?? []).every((step) => step.result?.status === 'passed'),
);
const executedTags = new Set(
  passed.flatMap((scenario) => (scenario.tags ?? []).map((tag) => tag.name)),
);
const missing = requiredFlows.filter((tag) => !executedTags.has(`@${tag}`));
const failed = scenarios.filter((scenario) =>
  (scenario.steps ?? []).some((step) =>
    ['failed', 'undefined', 'ambiguous', 'pending'].includes(step.result?.status),
  ),
);

const scenarioCoverage = scenarios.length === 0 ? 0 : (passed.length / scenarios.length) * 100;
const flowCoverage = ((requiredFlows.length - missing.length) / requiredFlows.length) * 100;

console.log(`Cucumber scenarios: ${passed.length}/${scenarios.length} passed`);
console.log(`Required business flows: ${requiredFlows.length - missing.length}/${requiredFlows.length} covered`);
console.log(`E2E flow coverage: ${flowCoverage.toFixed(2)}%`);

if (missing.length > 0) console.error(`Missing flow tags: ${missing.join(', ')}`);
if (failed.length > 0) {
  console.error(`Failed scenarios: ${failed.map((scenario) => scenario.name).join(' | ')}`);
}

if (scenarioCoverage !== 100 || flowCoverage !== 100 || failed.length > 0) {
  process.exitCode = 1;
}
